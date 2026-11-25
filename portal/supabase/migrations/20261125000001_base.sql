-- ============================================================================
-- 0001  Base: extensions, enum types, shared trigger functions
-- ============================================================================
-- Money rule for the whole database:
--   * totals and amounts are BIGINT centavos   (₱1,234.50 -> 123450)
--   * unit prices are NUMERIC(14,4) pesos       (₱0.8550 per piece)
--   * never float / double precision
-- Time rule: timestamps are timestamptz (stored UTC, shown in Asia/Manila).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Functions used by RLS live in a schema that is NOT exposed through the API.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ------------------------------------------------------------------ enums
create type public.staff_role as enum ('pa_admin', 'pa_sales', 'pa_production');
create type public.client_role as enum ('client_admin', 'client_buyer', 'client_viewer');

create type public.invitation_status as enum ('pending', 'needs_approval', 'accepted', 'cancelled', 'expired');

create type public.order_status as enum (
  'submitted', 'confirmed', 'prepress',
  'waiting_for_revisions', 'waiting_for_client_approval', 'approved_for_print',
  'printing', 'finishing', 'quality_check',
  'ready_for_pickup', 'out_for_delivery', 'delivered', 'closed',
  'on_hold', 'cancelled'
);
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid');
create type public.payment_method as enum ('bank_transfer', 'cheque');

create type public.quote_request_status as enum ('draft', 'submitted', 'quoted', 'accepted', 'declined', 'expired', 'cancelled');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'superseded', 'expired');
create type public.instant_quote_status as enum ('offered', 'accepted', 'expired', 'overridden', 'blocked');

create type public.artwork_status as enum ('draft', 'proof', 'approved', 'superseded');
create type public.file_kind as enum ('upload', 'drive_link');
create type public.rendition_status as enum ('pending', 'ready', 'failed', 'unsupported');
create type public.revision_status as enum ('open', 'in_prepress', 'proof_sent', 'approved', 'cancelled');
create type public.markup_shape as enum ('pin', 'box');
create type public.markup_staff_status as enum ('open', 'done', 'question');

create type public.estimate_status as enum ('draft', 'confirmed');
create type public.extracted_by as enum ('staff', 'ai', 'import');
create type public.price_source as enum ('estimate', 'quote', 'order', 'manual', 'standard');

-- -------------------------------------------------------- shared triggers
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Attach the updated_at trigger to every table in public that has the column.
-- Called once at the end of the last table migration.
create or replace function private.attach_updated_at_triggers()
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', r.table_name);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
         for each row execute function private.touch_updated_at()', r.table_name);
  end loop;
end $$;

-- Used on tables whose rows must never be hard-deleted (soft delete only).
create or replace function private.forbid_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Rows in % cannot be deleted. Set deleted_at instead.', tg_table_name
    using errcode = '42501';
end $$;

-- Asia/Manila "today" — used for order numbers and date maths.
create or replace function private.manila_now()
returns timestamp language sql stable as $$
  select (now() at time zone 'Asia/Manila')
$$;
