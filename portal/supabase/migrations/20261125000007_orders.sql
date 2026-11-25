-- ============================================================================
-- 0007  Orders, order items (snapshots), status timeline, payments
-- ============================================================================
-- Prices are kept in separate tables (order_item_prices, order_financials)
-- so that client_viewer and pa_production can read an order without ever
-- being able to read its money.
-- ============================================================================

create table public.order_number_counters (
  year int primary key,
  last_value int not null default 0
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_no text not null unique,
  kind text not null check (kind in ('new','reorder')),
  status public.order_status not null default 'submitted',
  client_po_no text,
  delivery_address_id uuid references public.addresses(id),
  delivery_address_snapshot jsonb,
  requested_delivery_date date,
  notes text,
  quote_id uuid references public.quotes(id),
  instant_quote_id uuid references public.instant_quotes(id),
  placed_by uuid references public.profiles(id),
  placed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index orders_org_idx on public.orders (organization_id, placed_at desc);
create index orders_status_idx on public.orders (status, placed_at desc);

alter table public.print_items
  add constraint print_items_source_order_fk foreign key (source_order_id) references public.orders(id);
alter table public.revision_requests
  add constraint revision_requests_order_fk foreign key (order_id) references public.orders(id);
alter table public.approvals
  add constraint approvals_order_fk foreign key (order_id) references public.orders(id);

-- What is ordered. Specs / artwork / colour standard are SNAPSHOTS taken when
-- the order is placed, so later changes to the Print Item never rewrite history.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  print_item_id uuid references public.print_items(id),
  product_id uuid references public.products(id),
  title text not null,
  quantity int not null check (quantity > 0),
  spec_snapshot jsonb not null default '{}'::jsonb,
  artwork_version_id uuid references public.artwork_versions(id),
  color_standard_snapshot jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_item_idx on public.order_items (print_item_id);

create table public.order_item_prices (
  order_item_id uuid primary key references public.order_items(id),
  organization_id uuid not null references public.organizations(id),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  vat_inclusive boolean not null default true,
  price_source public.price_source,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_financials (
  order_id uuid primary key references public.orders(id),
  organization_id uuid not null references public.organizations(id),
  net_centavos bigint not null default 0,
  vat_centavos bigint not null default 0,
  total_centavos bigint not null default 0,
  amount_paid_centavos bigint not null default 0,
  payment_status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  client_visible boolean not null default true,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events (order_id, created_at);

create table public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  status_event_id uuid references public.order_status_events(id),
  kind text not null check (kind in ('production_photo','delivery_photo','delivery_receipt','other')),
  file_id uuid not null references public.files(id),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  method public.payment_method not null,
  reference_no text,                -- bank reference or cheque number
  bank text,
  amount_centavos bigint not null check (amount_centavos > 0),
  received_on date not null,
  notes text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_payments_no_delete before delete on public.payments
  for each row execute function private.forbid_delete();

create table public.payment_slips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  file_id uuid not null references public.files(id),
  note text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------ order numbers
-- PA-2026-000123. The counter restarts every year (Asia/Manila calendar).
create or replace function private.next_order_no()
returns text language plpgsql security definer set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  n int;
begin
  insert into public.order_number_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = public.order_number_counters.last_value + 1
  returning last_value into n;
  return format('PA-%s-%s', y, lpad(n::text, 6, '0'));
end $$;

create or replace function private.set_order_no()
returns trigger language plpgsql as $$
begin
  if new.order_no is null or new.order_no = '' then
    new.order_no := private.next_order_no();
  end if;
  return new;
end $$;
create trigger trg_set_order_no before insert on public.orders
  for each row execute function private.set_order_no();

-- Keep order_financials.amount_paid / payment_status in sync with payments.
create or replace function private.rollup_payments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
  paid bigint;
  total bigint;
begin
  select coalesce(sum(amount_centavos), 0) into paid
    from public.payments where order_id = oid and deleted_at is null;
  select total_centavos into total from public.order_financials where order_id = oid;
  update public.order_financials
     set amount_paid_centavos = paid,
         payment_status = case
           when paid <= 0 then 'unpaid'::public.payment_status
           when total is not null and paid >= total then 'paid'::public.payment_status
           else 'partially_paid'::public.payment_status end
   where order_id = oid;
  return null;
end $$;
create trigger trg_rollup_payments after insert or update on public.payments
  for each row execute function private.rollup_payments();

-- Record every status change in the timeline automatically.
create or replace function private.log_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (organization_id, order_id, from_status, to_status, actor_id)
    values (new.organization_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_events (organization_id, order_id, from_status, to_status, note, actor_id)
    values (new.organization_id, new.id, old.status, new.status,
            nullif(current_setting('app.status_note', true), ''), auth.uid());
    if new.status = 'delivered' and new.delivered_at is null then
      update public.orders set delivered_at = now() where id = new.id;
    end if;
  end if;
  return null;
end $$;
create trigger trg_log_order_status after insert or update of status on public.orders
  for each row execute function private.log_order_status();

select private.attach_updated_at_triggers();
