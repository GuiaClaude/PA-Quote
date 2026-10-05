-- Print Amplified Finance — core schema (Phase 1)
--
-- Conventions
--   * Money is stored as bigint CENTAVOS in columns ending in _c (₱1,234.50 = 123450).
--   * Business dates are `date` (Asia/Manila calendar dates); events are timestamptz.
--   * Every business table has org_id, audit columns, soft delete (deleted_at) and
--     import lineage (source_type, source_id, source_row_key, content_hash).
--   * Row Level Security is ON for every table. Access is decided by membership role:
--       owner      – everything
--       bookkeeper – read + insert/update in open periods
--       viewer     – read only

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ───────────────────────────── Tenancy & users ─────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tin text,
  branch_code text default '000',
  rdo_code text,
  address text,
  vat_registered boolean not null default true,
  books_start_date date not null default date '2023-01-01',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  timezone text not null default 'Asia/Manila',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,                   -- copy of auth.users.email (users can't read auth.users)
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'bookkeeper', 'viewer')),
  mfa_required boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Role helpers. SECURITY DEFINER so policies can read memberships without recursion.
create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = p_org and m.user_id = auth.uid())
$$;

create or replace function app.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
  )
$$;

grant execute on function app.is_member(uuid), app.has_role(uuid, text[]) to authenticated;

-- ───────────────────────────── Audit log ─────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index audit_log_org_at on public.audit_log (org_id, at desc);

-- Generic row-change audit trigger. Runs as owner, so users can never write the log directly.
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_action text := lower(tg_op);
begin
  if tg_op = 'UPDATE' and v_old ? 'deleted_at' then
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'delete';
    elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
      v_action := 'restore';
    end if;
  end if;
  insert into audit_log (org_id, actor_id, action, table_name, record_id, before, after, reason)
  values (
    coalesce((v_new ->> 'org_id')::uuid, (v_old ->> 'org_id')::uuid),
    auth.uid(),
    v_action,
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_old,
    v_new,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return coalesce(new, old);
end $$;

-- Nobody may change or remove audit history, including the owner.
create or replace function app.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();

-- ───────────────────────────── Period locks ─────────────────────────────

create table public.period_locks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  locked_by uuid,
  locked_at timestamptz not null default now(),
  unlocked_by uuid,
  unlocked_at timestamptz,
  unlock_reason text,
  check (period_end >= period_start)
);
create index period_locks_org on public.period_locks (org_id, period_start, period_end);

-- Raises if p_date is before the books start date or inside an active lock.
-- Opening-balance entries are dated the day before the books start and are allowed
-- only when app.allow_opening is set by the opening-balance routine.
create or replace function app.assert_period_open(p_org uuid, p_date date) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date;
begin
  if p_date is null then
    return;
  end if;
  select books_start_date into v_start from organizations where id = p_org;
  if p_date < v_start and coalesce(current_setting('app.allow_opening', true), '') <> 'on' then
    raise exception 'Date % is before the books start date (%)', to_char(p_date, 'MM/DD/YYYY'), to_char(v_start, 'MM/DD/YYYY')
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from period_locks l
    where l.org_id = p_org and l.unlocked_at is null and p_date between l.period_start and l.period_end
  ) then
    raise exception 'Period containing % is closed. Ask the Owner to unlock it.', to_char(p_date, 'MM/DD/YYYY')
      using errcode = 'P0001';
  end if;
end $$;

-- Trigger wrapper: the dated column name is passed as the first trigger argument.
create or replace function app.guard_period() returns trigger
language plpgsql as $$
declare
  v_col text := tg_argv[0];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.assert_period_open(old.org_id, (to_jsonb(old) ->> v_col)::date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform app.assert_period_open(new.org_id, (to_jsonb(new) ->> v_col)::date);
  end if;
  return coalesce(new, old);
end $$;

-- ───────────────────────────── Live-update ping ─────────────────────────────

create table public.org_data_versions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  version bigint not null default 0,
  changed_tables text[] not null default '{}',
  at timestamptz not null default now()
);

create or replace function app.bump_data_version(p_org uuid, p_tables text[]) returns void
language sql security definer set search_path = public as $$
  insert into org_data_versions (org_id, version, changed_tables, at)
  values (p_org, 1, p_tables, now())
  on conflict (org_id) do update
    set version = org_data_versions.version + 1, changed_tables = excluded.changed_tables, at = now()
$$;
grant execute on function app.bump_data_version(uuid, text[]) to authenticated;

-- ───────────────────────────── Parties & jobs ─────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tin text,                     -- 9 digits, no dashes
  tin_branch text,              -- 3–5 digits; '000' = head office
  address text,
  contact_person text,
  email text,
  phone text,
  terms_days int not null default 30 check (terms_days >= 0),
  vat_status text not null default 'vat' check (vat_status in ('vat', 'non_vat', 'zero_rated', 'exempt')),
  cwt_rate_bp int not null default 0 check (cwt_rate_bp between 0 and 1500),  -- basis points: 200 = 2%
  notes text,
  merged_into_id uuid references public.clients(id),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text
);
create index clients_org_name on public.clients using gin (name gin_trgm_ops);
create unique index clients_org_tin on public.clients (org_id, tin, coalesce(tin_branch, '000'))
  where tin is not null and deleted_at is null and merged_into_id is null;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  payee_account_name text,
  tin text,
  tin_branch text,
  address text,
  contact_person text,
  email text,
  phone text,
  terms_days int not null default 30 check (terms_days >= 0),
  vat_status text not null default 'vat' check (vat_status in ('vat', 'non_vat', 'zero_rated', 'exempt')),
  supplier_type text not null default 'goods' check (supplier_type in ('goods', 'services', 'professional', 'rental', 'utilities', 'government', 'other')),
  ewt_rate_bp int not null default 0 check (ewt_rate_bp between 0 and 1500),
  default_category_id uuid,
  bank_details text,
  notes text,
  merged_into_id uuid references public.suppliers(id),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text
);
create index suppliers_org_name on public.suppliers using gin (name gin_trgm_ops);
create unique index suppliers_org_tin on public.suppliers (org_id, tin, coalesce(tin_branch, '000'))
  where tin is not null and deleted_at is null and merged_into_id is null;

create table public.party_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  party_type text not null check (party_type in ('client', 'supplier')),
  party_id uuid not null,
  alias_normalized text not null,
  source text,
  approved_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, party_type, alias_normalized)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ce_number text not null,          -- as written, e.g. "CE# ABC2024-001" or "PA-CE-2026-0001"
  ce_key text not null,             -- normalised for matching (uppercase, no spaces/#)
  po_number text,
  client_id uuid references public.clients(id),
  name text not null,
  job_type text,
  quoted_c bigint check (quoted_c is null or quoted_c >= 0),
  status text not null default 'ongoing' check (status in ('quoted', 'ongoing', 'completed', 'billed', 'cancelled')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text
);
create unique index projects_org_ce on public.projects (org_id, ce_key) where deleted_at is null;

-- ───────────────────────────── Chart of accounts & ledger ─────────────────────────────

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'other_income', 'other_expense')),
  subtype text,
  normal_side text not null check (normal_side in ('debit', 'credit')),
  parent_id uuid references public.accounts(id),
  is_system boolean not null default false,   -- used by automatic posting; can be renamed, not deleted
  is_active boolean not null default true,
  tax_tag text,                                -- e.g. input_vat, output_vat, deferred_output_vat, cwt
  bir_summary_column text,                     -- column in the BIR purchases summary (INPUT sheet)
  purchase_class text check (purchase_class in ('goods', 'services', 'capital_goods')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entry_no bigint generated by default as identity,
  entry_date date not null,
  memo text,
  kind text not null check (kind in ('auto', 'manual', 'reversal', 'closing', 'opening')),
  source_doc_type text,          -- billing, collection, purchase, ap_payment, …
  source_doc_id uuid,
  reverses_id uuid references public.journal_entries(id),
  reversed_at timestamptz,       -- set when a later reversal cancels this entry
  posted_at timestamptz not null default now(),
  posted_by uuid default auth.uid()
);
create index journal_entries_org_date on public.journal_entries (org_id, entry_date);
-- One live automatic entry per source document.
create unique index journal_entries_live_source on public.journal_entries (org_id, source_doc_type, source_doc_id)
  where kind = 'auto' and reversed_at is null;

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_no int not null,
  account_id uuid not null references public.accounts(id),
  debit_c bigint not null default 0 check (debit_c >= 0),
  credit_c bigint not null default 0 check (credit_c >= 0),
  party_type text check (party_type in ('client', 'supplier', 'employee')),
  party_id uuid,
  project_id uuid references public.projects(id),
  memo text,
  check ((debit_c = 0) <> (credit_c = 0))   -- exactly one side is non-zero
);
create index journal_lines_entry on public.journal_lines (entry_id);
create index journal_lines_org_account on public.journal_lines (org_id, account_id);

-- Every journal entry must balance (Σ debit = Σ credit) and have at least 2 lines.
-- Deferred to commit time, so an entry can be inserted line by line inside a transaction.
create or replace function app.check_entry_balanced() returns trigger
language plpgsql as $$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
  v_dr bigint; v_cr bigint; v_n int;
begin
  if not exists (select 1 from journal_entries where id = v_entry) then
    return null;  -- entry itself was deleted (cascade)
  end if;
  select coalesce(sum(debit_c), 0), coalesce(sum(credit_c), 0), count(*)
    into v_dr, v_cr, v_n from journal_lines where entry_id = v_entry;
  if v_n < 2 or v_dr <> v_cr then
    raise exception 'Journal entry % is not balanced (debits %, credits %, % lines)', v_entry, v_dr, v_cr, v_n
      using errcode = 'P0002';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_balanced
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function app.check_entry_balanced();

-- An entry with no lines at all is also rejected.
create or replace function app.check_entry_has_lines() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from journal_entries where id = new.id)
     and not exists (select 1 from journal_lines where entry_id = new.id) then
    raise exception 'Journal entry % has no lines', new.id using errcode = 'P0002';
  end if;
  return null;
end $$;

create constraint trigger journal_entries_has_lines
  after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function app.check_entry_has_lines();

-- ───────────────────────────── Bank & payment accounts ─────────────────────────────

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  bank text,
  account_no_masked text,
  type text not null check (type in ('current', 'savings', 'ewallet', 'clearing', 'cash')),
  gl_account_id uuid not null references public.accounts(id),
  opening_balance_c bigint not null default 0,
  opening_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Tax settings ─────────────────────────────

create table public.tax_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  vat_rate_bp int not null default 1200,
  default_cwt_rate_bp int not null default 200,
  confirmed_by_accountant boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

-- Output VAT basis per date range: 'collected' (deferred until paid) or 'billed'.
create table public.vat_basis_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  start_date date not null,
  end_date date,                 -- null = open-ended
  basis text not null check (basis in ('collected', 'billed')),
  note text
);

-- ───────────────────────────── Sales: billings & collections ─────────────────────────────

create table public.billings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null default 'sales_invoice'
    check (doc_type in ('sales_invoice', 'billing_invoice', 'billing_statement', 'or_converted_invoice')),
  doc_no text not null,                -- main number as written, e.g. "0412"
  extra_doc_nos text[] not null default '{}',  -- other numbers on the same row ("#0273/#0274")
  client_id uuid not null references public.clients(id),
  project_id uuid references public.projects(id),
  billing_date date not null,
  terms_days int not null default 30,
  terms_text text,
  due_date date not null,
  po_number text,
  job_type text,
  description text,
  vat_treatment text not null default 'vat' check (vat_treatment in ('vat', 'zero_rated', 'exempt', 'non_vat')),
  gross_c bigint not null check (gross_c >= 0),
  net_c bigint not null check (net_c >= 0),
  vat_c bigint not null check (vat_c >= 0),
  cwt_rate_bp int not null default 0,
  vat_basis text not null check (vat_basis in ('collected', 'billed')),
  status text not null default 'billed'
    check (status in ('draft', 'billed', 'for_collection', 'due_follow_up', 'paid', 'rejected', 'void')),
  status_reason text,
  remarks text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text,
  check (net_c + vat_c = gross_c)
);
create index billings_org_date on public.billings (org_id, billing_date);
create index billings_org_client on public.billings (org_id, client_id);
create unique index billings_org_doc on public.billings (org_id, doc_type, doc_no) where deleted_at is null and status <> 'void';

create table public.billing_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  billing_id uuid not null references public.billings(id) on delete cascade,
  line_no int not null,
  description text not null,
  qty numeric(14, 3) not null default 1,
  unit_price_c bigint not null default 0,
  amount_c bigint not null check (amount_c >= 0),   -- VAT-inclusive line amount
  revenue_account_id uuid references public.accounts(id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  collection_date date not null,
  receipt_type text not null default 'none'
    check (receipt_type in ('sales_invoice', 'official_receipt', 'collection_receipt', 'acknowledgement_receipt', 'none')),
  receipt_no text,
  payment_mode text not null
    check (payment_mode in ('cash', 'bank_deposit', 'cheque_deposit', 'cheque_pickup', 'online_bank', 'bank_wire', 'gcash', 'offsetting')),
  payment_reference text,
  cheque_no text,
  cheque_date date,
  deposit_account_id uuid not null references public.bank_accounts(id),
  cash_c bigint not null check (cash_c >= 0),       -- money actually received
  cwt_c bigint not null default 0 check (cwt_c >= 0), -- tax withheld by the client (BIR 2307)
  form_2307_status text not null default 'not_required'
    check (form_2307_status in ('not_required', 'pending', 'received', 'for_revision')),
  form_2307_received_date date,
  remarks text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text
);
create index collections_org_date on public.collections (org_id, collection_date);

create table public.collection_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  billing_id uuid not null references public.billings(id),
  applied_c bigint not null check (applied_c >= 0),   -- cash applied to this billing
  cwt_c bigint not null default 0 check (cwt_c >= 0), -- CWT applied to this billing
  vat_reclass_c bigint not null default 0 check (vat_reclass_c >= 0) -- deferred VAT moved to output VAT by this payment
);
create index collection_allocations_billing on public.collection_allocations (billing_id);

create table public.follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  billing_id uuid not null references public.billings(id) on delete cascade,
  note text not null,
  next_follow_up_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Purchases & payables ─────────────────────────────

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  expense_type text not null check (expense_type in ('direct_materials', 'overhead_fixed', 'overhead_non_fixed')),
  account_id uuid not null references public.accounts(id),
  header_synonyms text[] not null default '{}',
  is_active boolean not null default true,
  unique (org_id, name)
);

alter table public.suppliers
  add constraint suppliers_default_category_fk foreign key (default_category_id) references public.expense_categories(id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  project_id uuid references public.projects(id),
  doc_type text not null default 'sales_invoice'
    check (doc_type in ('sales_invoice', 'official_receipt', 'collection_receipt', 'billing_invoice', 'cash_invoice', 'delivery_receipt', 'acknowledgement', 'none')),
  reference_no text,
  or_cr_no text,
  ar_no text,
  invoice_date date not null,
  terms_days int not null default 30,
  terms_text text,
  due_date date not null,
  description text,
  vat_treatment text not null default 'vat' check (vat_treatment in ('vat', 'zero_rated', 'exempt', 'non_vat')),
  total_c bigint not null check (total_c >= 0),   -- invoice amount, VAT-inclusive
  net_c bigint not null check (net_c >= 0),
  input_vat_c bigint not null check (input_vat_c >= 0),
  ewt_c bigint not null default 0 check (ewt_c >= 0),  -- expanded withholding tax we deduct
  no_receipt boolean not null default false,          -- no valid receipt → no input VAT claimed
  approval_status text not null default 'approved_in_process'
    check (approval_status in ('to_be_processed', 'for_revision', 'approved_in_process', 'paid', 'unpaid')),
  with_2307 boolean not null default false,
  sent_to_platform text,
  remarks text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text,
  check (net_c + input_vat_c = total_c),
  check (ewt_c <= total_c)
);
create index purchases_org_date on public.purchases (org_id, invoice_date);
create index purchases_org_supplier on public.purchases (org_id, supplier_id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  line_no int not null,
  category_id uuid not null references public.expense_categories(id),
  description text,
  gross_c bigint not null check (gross_c >= 0),
  net_c bigint not null check (net_c >= 0),
  vat_c bigint not null check (vat_c >= 0),
  project_id uuid references public.projects(id),
  check (net_c + vat_c = gross_c)
);

create table public.ap_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  payment_date date not null,
  payment_mode text not null check (payment_mode in (
    'bizlink', 'bank_transfer_spenmo', 'gcash_spenmo', 'gcash_reimbursement', 'cheque', 'bpi_check',
    'cash', 'lalamove_wallet', 'paymaya', 'credit_card', 'project_offsetting')),
  paid_from_account_id uuid not null references public.bank_accounts(id),
  amount_c bigint not null check (amount_c > 0),
  reference_no text,
  cheque_no text,
  check_date date,
  check_status text check (check_status in ('posted', 'unposted')),
  remarks text,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  source_type text, source_id text, source_row_key text, content_hash text
);
create index ap_payments_org_date on public.ap_payments (org_id, payment_date);

create table public.ap_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ap_payment_id uuid not null references public.ap_payments(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id),
  applied_c bigint not null check (applied_c > 0)
);
create index ap_payment_allocations_purchase on public.ap_payment_allocations (purchase_id);

-- ───────────────────────────── Attachments ─────────────────────────────

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bucket text not null,
  path text not null,
  file_name text not null,
  mime text,
  size_bytes bigint,
  sha256 text,
  linked_type text not null,
  linked_id uuid not null,
  kind text not null default 'other' check (kind in ('invoice', '2307', 'deposit_slip', 'receipt', 'payroll', 'other')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ───────────────────────────── Import lineage uniqueness ─────────────────────────────
-- Re-syncing the same source row updates the record instead of creating a duplicate.

do $$
declare t text;
begin
  foreach t in array array['clients', 'suppliers', 'projects', 'billings', 'collections', 'purchases', 'ap_payments'] loop
    execute format(
      'create unique index %1$s_source_row on public.%1$s (org_id, source_type, source_id, source_row_key) where source_row_key is not null',
      t);
  end loop;
end $$;

-- ───────────────────────────── Triggers: updated_at, period guard, audit ─────────────────────────────

create or replace function app.touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid()));
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations', 'clients', 'suppliers', 'projects', 'accounts', 'billings', 'collections', 'purchases', 'ap_payments'] loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated()', t);
  end loop;

  foreach t in array array['organizations', 'memberships', 'clients', 'suppliers', 'projects', 'accounts', 'billings', 'collections',
                           'collection_allocations', 'purchases', 'purchase_lines', 'ap_payments', 'ap_payment_allocations',
                           'journal_entries', 'period_locks', 'tax_settings', 'vat_basis_periods', 'bank_accounts', 'expense_categories'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit_row()', t);
  end loop;
end $$;

create trigger billings_period before insert or update or delete on public.billings
  for each row execute function app.guard_period('billing_date');
create trigger collections_period before insert or update or delete on public.collections
  for each row execute function app.guard_period('collection_date');
create trigger purchases_period before insert or update or delete on public.purchases
  for each row execute function app.guard_period('invoice_date');
create trigger ap_payments_period before insert or update or delete on public.ap_payments
  for each row execute function app.guard_period('payment_date');
create trigger journal_entries_period before insert or update or delete on public.journal_entries
  for each row execute function app.guard_period('entry_date');

-- ───────────────────────────── Row Level Security ─────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'suppliers', 'party_aliases', 'projects', 'accounts', 'journal_entries', 'journal_lines',
    'bank_accounts', 'vat_basis_periods', 'billings', 'billing_lines', 'collections', 'collection_allocations',
    'follow_up_notes', 'expense_categories', 'purchases', 'purchase_lines', 'ap_payments', 'ap_payment_allocations',
    'attachments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (app.is_member(org_id))', t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
                     with check (app.has_role(org_id, array['owner','bookkeeper']))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
                     using (app.has_role(org_id, array['owner','bookkeeper']))
                     with check (app.has_role(org_id, array['owner','bookkeeper']))$p$, t);
    -- Hard deletes: owner only (normal "delete" in the app is a soft delete = update).
    -- Bookkeepers may hard-delete child rows that are rewritten on edit.
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
                     using (app.has_role(org_id, %2$L::text[]))$p$, t,
                   case when t in ('journal_lines', 'billing_lines', 'purchase_lines', 'collection_allocations', 'ap_payment_allocations')
                        then '{owner,bookkeeper}' else '{owner}' end);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Organisation: members read; owner updates.
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_role(id, array['owner'])) with check (app.has_role(id, array['owner']));
grant select, update on public.organizations to authenticated;

-- Memberships: members see their org's team; only the owner manages it.
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to authenticated using (app.is_member(org_id));
create policy memberships_write on public.memberships for all to authenticated
  using (app.has_role(org_id, array['owner'])) with check (app.has_role(org_id, array['owner']));
grant select, insert, update, delete on public.memberships to authenticated;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.user_id));
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid());
grant select, update on public.profiles to authenticated;

-- Tax settings and locks: everyone reads; only the owner changes them.
alter table public.tax_settings enable row level security;
create policy tax_settings_select on public.tax_settings for select to authenticated using (app.is_member(org_id));
create policy tax_settings_write on public.tax_settings for all to authenticated
  using (app.has_role(org_id, array['owner'])) with check (app.has_role(org_id, array['owner']));
grant select, insert, update on public.tax_settings to authenticated;

alter table public.period_locks enable row level security;
create policy period_locks_select on public.period_locks for select to authenticated using (app.is_member(org_id));
-- Bookkeepers may close (lock) a period; only owners may unlock (update) or delete.
create policy period_locks_insert on public.period_locks for insert to authenticated
  with check (app.has_role(org_id, array['owner', 'bookkeeper']));
create policy period_locks_update on public.period_locks for update to authenticated
  using (app.has_role(org_id, array['owner'])) with check (app.has_role(org_id, array['owner']));
grant select, insert, update on public.period_locks to authenticated;

-- Audit log: owner and bookkeeper can read; nobody writes directly.
alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.has_role(org_id, array['owner', 'bookkeeper']));
grant select on public.audit_log to authenticated;

alter table public.org_data_versions enable row level security;
create policy org_data_versions_select on public.org_data_versions for select to authenticated using (app.is_member(org_id));
grant select on public.org_data_versions to authenticated;

grant usage on all sequences in schema public to authenticated;

-- ───────────────────────────── Open-balance views ─────────────────────────────
-- security_invoker: the views obey the caller's RLS, they never widen access.

create view public.v_billing_balances with (security_invoker = true) as
select
  b.id, b.org_id, b.client_id, b.project_id, b.doc_type, b.doc_no, b.billing_date, b.due_date, b.status,
  b.gross_c, b.net_c, b.vat_c, b.vat_basis,
  coalesce(p.paid_c, 0)::bigint as paid_c,
  coalesce(p.cwt_c, 0)::bigint as cwt_c,
  coalesce(p.vat_reclass_c, 0)::bigint as vat_reclass_c,
  (b.gross_c - coalesce(p.paid_c, 0) - coalesce(p.cwt_c, 0))::bigint as balance_c,
  p.last_paid_on
from public.billings b
left join lateral (
  select sum(a.applied_c) as paid_c, sum(a.cwt_c) as cwt_c, sum(a.vat_reclass_c) as vat_reclass_c, max(c.collection_date) as last_paid_on
  from public.collection_allocations a
  join public.collections c on c.id = a.collection_id and c.deleted_at is null
  where a.billing_id = b.id
) p on true
where b.deleted_at is null;

create view public.v_purchase_balances with (security_invoker = true) as
select
  pu.id, pu.org_id, pu.supplier_id, pu.project_id, pu.reference_no, pu.invoice_date, pu.due_date, pu.approval_status,
  pu.total_c, pu.ewt_c, pu.total_c - pu.ewt_c as payable_c,
  coalesce(p.paid_c, 0)::bigint as paid_c,
  (pu.total_c - pu.ewt_c - coalesce(p.paid_c, 0))::bigint as balance_c,
  p.last_paid_on
from public.purchases pu
left join lateral (
  select sum(a.applied_c) as paid_c, max(ap.payment_date) as last_paid_on
  from public.ap_payment_allocations a
  join public.ap_payments ap on ap.id = a.ap_payment_id and ap.deleted_at is null
  where a.purchase_id = pu.id
) p on true
where pu.deleted_at is null;

-- Journal lines with their entry date and account, live entries only (reversed pairs cancel out anyway).
create view public.v_ledger with (security_invoker = true) as
select l.org_id, l.entry_id, e.entry_no, e.entry_date, e.kind, e.memo as entry_memo, e.source_doc_type, e.source_doc_id,
       l.line_no, l.account_id, a.code as account_code, a.name as account_name, a.type as account_type, a.subtype as account_subtype,
       l.debit_c, l.credit_c, l.party_type, l.party_id, l.project_id, l.memo
from public.journal_lines l
join public.journal_entries e on e.id = l.entry_id
join public.accounts a on a.id = l.account_id;

grant select on public.v_billing_balances, public.v_purchase_balances, public.v_ledger to authenticated;
