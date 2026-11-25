-- ============================================================================
-- 0006  Past estimates, agreed prices, pricing rules, instant quotes
-- ============================================================================

create table public.past_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid references public.print_items(id),
  estimate_no text,
  estimate_date date not null,
  vat_inclusive boolean not null default true,
  valid_until date,
  notes text,
  status public.estimate_status not null default 'draft',
  extracted_by public.extracted_by not null default 'staff',
  original_file_id uuid references public.files(id),       -- staff-only original
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index past_estimates_item_idx on public.past_estimates (print_item_id, estimate_date desc);

create table public.past_estimate_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  past_estimate_id uuid not null references public.past_estimates(id) on delete cascade,
  description text,
  spec jsonb not null default '{}'::jsonb,
  spec_signature text,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.past_estimate_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  past_estimate_id uuid not null references public.past_estimates(id) on delete cascade,
  label text not null,                              -- Plates, Die, Setup, Layout, Delivery
  amount_centavos bigint not null check (amount_centavos >= 0),
  recharge_on_reorder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The agreed price per quantity tier for a client's Print Item.
create table public.price_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  vat_inclusive boolean not null default true,
  source public.price_source not null,
  source_ref text,                                  -- estimate / quote / order number
  past_estimate_line_id uuid references public.past_estimate_lines(id),
  base_date date not null,                          -- original estimate / order date (inflation starts here)
  valid_until date,
  is_current boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index price_tiers_one_current
  on public.price_tiers (print_item_id, quantity) where is_current;

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  price_tier_id uuid not null references public.price_tiers(id),
  print_item_id uuid not null references public.print_items(id),
  quantity int not null,
  old_unit_price numeric(14,4),
  new_unit_price numeric(14,4),
  old_total_centavos bigint,
  new_total_centavos bigint,
  old_base_date date,
  new_base_date date,
  change text not null check (change in ('created','updated','retired')),
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function private.log_price_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.price_history (organization_id, price_tier_id, print_item_id, quantity,
      new_unit_price, new_total_centavos, new_base_date, change, changed_by)
    values (new.organization_id, new.id, new.print_item_id, new.quantity,
      new.unit_price, new.total_centavos, new.base_date, 'created', auth.uid());
  elsif tg_op = 'UPDATE' and (old.unit_price, old.total_centavos, old.base_date, old.is_current)
        is distinct from (new.unit_price, new.total_centavos, new.base_date, new.is_current) then
    insert into public.price_history (organization_id, price_tier_id, print_item_id, quantity,
      old_unit_price, new_unit_price, old_total_centavos, new_total_centavos,
      old_base_date, new_base_date, change, changed_by)
    values (new.organization_id, new.id, new.print_item_id, new.quantity,
      old.unit_price, new.unit_price, old.total_centavos, new.total_centavos,
      old.base_date, new.base_date,
      case when old.is_current and not new.is_current then 'retired' else 'updated' end, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_price_history after insert or update on public.price_tiers
  for each row execute function private.log_price_history();
create trigger trg_price_tiers_no_delete before delete on public.price_tiers
  for each row execute function private.forbid_delete();

-- ------------------------------------------------------------ pricing rules
-- Every change is a NEW row (history is never overwritten). The row that
-- applies on a date is the latest one with effective_from <= that date.
create table public.inflation_rates (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2000 and 2100),
  rate_pct numeric(6,3) not null check (rate_pct > -50 and rate_pct < 100),
  source_note text,                               -- "PSA headline, please confirm"
  needs_confirmation boolean not null default true,
  effective_from timestamptz not null default now(),
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inflation_rates_year_idx on public.inflation_rates (year, effective_from desc);

create table public.category_surcharges (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id),
  material_key text,                               -- e.g. 'paperboard'
  label text not null,
  pct numeric(6,3) not null,
  effective_from date not null,
  effective_to date,
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category_id is not null or material_key is not null)
);

create table public.fixed_addons (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('order','category')),
  category_id uuid references public.product_categories(id),
  label text not null,
  amount_centavos bigint not null check (amount_centavos >= 0),
  effective_from date not null,
  effective_to date,
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope = 'order' or category_id is not null)
);

create table public.pricing_settings (
  id uuid primary key default gen_random_uuid(),
  version_no int not null unique,
  rounding_step_pesos int not null default 5 check (rounding_step_pesos in (1,5,10)),
  rounding_scope text not null default 'order_total' check (rounding_scope in ('order_total','unit_price')),
  vat_rate_pct numeric(5,2) not null default 12.00,
  quote_validity_days int not null default 15 check (quote_validity_days between 1 and 365),
  max_estimate_age_years numeric(4,1) not null default 3.0,
  max_adjustment_pct numeric(6,2) not null default 20.00,
  show_breakdown_to_clients boolean not null default false,
  quote_reply_target_hours int not null default 24,
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pricing_settings_no_update before update on public.pricing_settings
  for each row execute function private.forbid_update();

-- Every instant quote stores ALL inputs so it can be explained later.
create table public.instant_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  quote_request_id uuid references public.quote_requests(id),     -- when blocked -> Needs Quote
  quantity int not null check (quantity > 0),
  base_price_tier_id uuid references public.price_tiers(id),
  base_unit_price numeric(14,4),
  base_total_centavos bigint,
  base_date date,
  base_vat_inclusive boolean,
  inflation_factor numeric(12,8),
  inflation_detail jsonb,                         -- [{year, rate_pct, fraction}]
  surcharge_pct numeric(6,3),
  client_adjustment_pct numeric(6,3),
  addons_centavos bigint,
  addons_detail jsonb,
  recharged_centavos bigint,                      -- one-time charges billed again
  pricing_settings_version int,
  adjustment_pct numeric(8,3),
  pre_round_total numeric(16,4),
  final_net_centavos bigint,                      -- VAT-exclusive
  vat_centavos bigint,
  final_total_centavos bigint,                    -- VAT-inclusive total shown to client
  valid_until date,
  status public.instant_quote_status not null,
  block_reasons text[] not null default '{}',
  override_by uuid references public.profiles(id),
  override_reason text,
  override_old_total_centavos bigint,
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  accepted_ip inet,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index instant_quotes_org_idx on public.instant_quotes (organization_id, created_at desc);
