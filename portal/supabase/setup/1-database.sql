-- Print Amplified ordering app: full database set-up.
-- Paste into Supabase → SQL Editor → New query → Run. Run ONCE on a NEW project.
-- Generated from supabase/migrations by scripts/db/bundle-for-sql-editor.sh — do not edit by hand.

-- ===== 20261125000001_base.sql =====
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

commit;

-- ===== 20261125000002_access.sql =====
-- ============================================================================
-- 0002  Companies, people, access, addresses, settings, audit, notifications
-- ============================================================================

-- --------------------------------------------------------- client companies
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  billing_name text,
  tin text,
  credit_terms text,                         -- free text, e.g. "30 days PDC"
  logo_path text,
  notes text,
  allow_instant_quotes boolean not null default true,
  allow_highres_download boolean not null default false,   -- pa_admin only (trigger)
  client_adjustment_pct numeric(6,3) not null default 0,   -- e.g. -3.000 = 3% loyalty discount
  client_adjustment_cap_pct numeric(6,3),                  -- optional negotiated cap on total adjustment
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  domain text not null check (domain = lower(domain) and domain !~ '[@\s]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain)
);

-- -------------------------------------------------------------- profiles
-- One row per login (auth.users). staff_role is set only for Print Amplified
-- staff. Client roles live in memberships (ready for multi-company later).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  viber text,
  job_title text,
  staff_role public.staff_role,
  is_active boolean not null default true,
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  client_role public.client_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, organization_id)
);
-- v1 rule: a client user belongs to ONE company. Drop this index to allow
-- agencies with several brands (the company switcher) in a later phase.
create unique index memberships_one_active_company
  on public.memberships (profile_id) where is_active;

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  staff_profile_id uuid not null references public.profiles(id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_profile_id)
);
create unique index staff_assignments_one_primary
  on public.staff_assignments (organization_id) where is_primary;

-- ------------------------------------------------------------ invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),   -- null = staff invite
  email text not null,
  client_role public.client_role,
  staff_role public.staff_role,
  token_hash text not null unique,          -- sha256 of the emailed token; token itself never stored
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  accepted_profile_id uuid references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  send_count int not null default 1,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null and staff_role is not null and client_role is null)
      or (organization_id is not null and client_role is not null and staff_role is null))
);
create index invitations_email_idx on public.invitations (lower(email));

-- --------------------------------------------------- login security records
create table public.auth_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  kind text not null check (kind in ('login_ok','login_fail','lockout','new_device','logout_all','password_reset','mfa_enrolled','mfa_fail')),
  ip inet,
  user_agent text,
  device_id_hash text,
  created_at timestamptz not null default now()
);
create index auth_events_email_time_idx on public.auth_events (lower(email), created_at desc);

create table public.known_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id_hash text not null,
  label text,
  is_installed_app boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, device_id_hash)
);

-- ------------------------------------------------------------- addresses
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null,                 -- "Head office", "Warehouse – Laguna"
  recipient text,
  phone text,
  line1 text not null,
  line2 text,
  barangay text,
  city text not null,
  province text,
  zip text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- --------------------------------------------------------------- settings
-- Key/value settings. `visibility` decides who may read a key:
--   public  = anyone, even signed out (company name, logo, brand colours)
--   client  = any signed-in user (payment instructions, support contacts)
--   staff   = Print Amplified staff only
create table public.settings (
  key text primary key,
  value jsonb not null,
  visibility text not null default 'staff' check (visibility in ('public','client','staff')),
  description text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------- audit log
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  organization_id uuid references public.organizations(id),
  action text not null,               -- e.g. 'login.failed', 'user.deactivated', 'price.changed'
  entity_type text,
  entity_id text,
  ip inet,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_time_idx on public.audit_logs (created_at desc);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

create or replace function private.audit_logs_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The audit log is append-only.' using errcode = '42501';
end $$;
create trigger trg_audit_append_only before update or delete on public.audit_logs
  for each row execute function private.audit_logs_append_only();

-- --------------------------------------------------------- notifications
-- In-app inbox. Later phases (reorder reminders, announcements) write here too.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------- new login -> profile row
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

commit;

-- ===== 20261125000003_catalog_quotes.sql =====
-- ============================================================================
-- 0003  Product catalog, quote requests, quotes, drafts
-- ============================================================================

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  photo_path text,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id),
  name text not null,
  slug text not null unique,
  description text,
  photo_paths text[] not null default '{}',
  default_lead_time_text text,               -- "5–7 working days"
  visibility text not null default 'all' check (visibility in ('all','selected')),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Which companies may see a product when visibility = 'selected'.
create table public.product_visibility (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, organization_id)
);

-- Choices shown in the guided spec form.
create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('size','material','colors','finishing','packaging','quantity','other')),
  label text not null,
  value jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Standard price list for common specs: these can be ordered immediately.
create table public.standard_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  spec jsonb not null,
  spec_signature text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  vat_inclusive boolean not null default true,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, spec_signature, quantity)
);

-- A client's request for a price (new order, or a reorder that needs a quote).
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  request_no text unique,
  kind text not null default 'new' check (kind in ('new','reorder')),
  product_id uuid references public.products(id),
  print_item_id uuid,                        -- FK added after print_items exists
  title text not null,
  spec jsonb not null default '{}'::jsonb,
  spec_signature text,
  quantities int[] not null default '{}',
  needs_design_help boolean not null default false,
  requested_delivery_date date,
  delivery_address_id uuid references public.addresses(id),
  client_po_no text,
  notes text,
  status public.quote_request_status not null default 'submitted',
  needs_quote_reasons text[] not null default '{}',  -- 'specs_changed','has_revisions','quantity_not_in_tiers','estimate_too_old','adjustment_over_limit','instant_quotes_off','no_past_price'
  -- No prices on this table: client_viewer can read it. The suggested
  -- adjusted price for a "Needs Quote" lives in instant_quotes (status 'blocked').
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  reply_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index quote_requests_org_idx on public.quote_requests (organization_id, created_at desc);
create index quote_requests_status_idx on public.quote_requests (status, submitted_at);

-- Staff reply with prices.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_request_id uuid not null references public.quote_requests(id),
  quote_no text unique,
  revision_no int not null default 1,
  lead_time_text text,
  valid_until date,
  vat_inclusive boolean not null default true,
  notes text,
  status public.quote_status not null default 'draft',
  sent_by uuid references public.profiles(id),
  sent_at timestamptz,
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  response_ip inet,
  decline_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_org_idx on public.quotes (organization_id, created_at desc);

create table public.quote_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_request_id uuid not null references public.quote_requests(id),
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Saved drafts (new orders) and the reorder cart.
create table public.draft_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('new','reorder_cart')),
  title text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

commit;

-- ===== 20261125000004_print_items_files.sql =====
-- ============================================================================
-- 0004  Print Items, artwork versions, files, previews, colour standards,
--       fonts and editable templates
-- ============================================================================

create table public.print_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text,                                   -- client's or PA's item code
  name text not null,
  category_id uuid references public.product_categories(id),
  product_id uuid references public.products(id),
  tags text[] not null default '{}',
  spec jsonb not null default '{}'::jsonb,     -- size, material, gsm, colors, finishing[], packaging, notes
  spec_signature text,                         -- sha256 of the canonical spec (set by the app)
  approved_version_id uuid,                    -- FK added below
  color_standard_id uuid,                      -- FK added below
  source_order_id uuid,                        -- order that created it (FK in 0006)
  thumbnail_path text,                         -- previews bucket
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index print_items_org_idx on public.print_items (organization_id, name);
create index print_items_tags_idx on public.print_items using gin (tags);

alter table public.quote_requests
  add constraint quote_requests_print_item_fk foreign key (print_item_id) references public.print_items(id);

create table public.artwork_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  version_no int not null,
  change_notes text,
  status public.artwork_status not null default 'draft',
  is_locked boolean not null default false,
  uploaded_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (print_item_id, version_no)
);
-- Exactly one "Approved for Print" version per item.
create unique index artwork_versions_one_approved
  on public.artwork_versions (print_item_id) where status = 'approved';

alter table public.print_items
  add constraint print_items_approved_version_fk foreign key (approved_version_id) references public.artwork_versions(id);

-- Approved / locked versions can never be edited or deleted. The only change
-- allowed is approved -> superseded when a newer version is approved.
create or replace function private.guard_locked_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.is_locked or old.status in ('approved','superseded') then
      raise exception 'Approved artwork versions cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_locked then
    if new.status = 'superseded' and old.status = 'approved'
       and new.is_locked and new.version_no = old.version_no
       and new.print_item_id = old.print_item_id
       and new.change_notes is not distinct from old.change_notes then
      return new;
    end if;
    raise exception 'This version is Approved for Print and locked. Upload a new version instead.'
      using errcode = '42501';
  end if;
  if new.status = 'approved' then
    new.is_locked := true;
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;
create trigger trg_guard_locked_version before update or delete on public.artwork_versions
  for each row execute function private.guard_locked_version();

-- Any stored file: high-res print files, attachments, payment slips, estimate
-- originals, press-sheet photos — or a Google Drive link.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),    -- null for global assets (fonts, catalog photos)
  artwork_version_id uuid references public.artwork_versions(id),
  purpose text not null check (purpose in (
    'artwork','revision_attachment','payment_slip','estimate_original',
    'color_standard_photo','order_photo','delivery_receipt','font','catalog_photo','quote_request_artwork','other')),
  kind public.file_kind not null default 'upload',
  bucket text check (bucket in ('print-files','previews','attachments','assets','brand')),
  storage_path text,
  external_url text,
  label text,
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  copied_to_archive_at timestamptz,            -- Drive link has been copied into the archive
  copied_to_archive_by uuid references public.profiles(id),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'upload' and bucket is not null and storage_path is not null)
      or (kind = 'drive_link' and external_url is not null))
);
create index files_version_idx on public.files (artwork_version_id);
create index files_sha_idx on public.files (organization_id, sha256);

-- Files are never hard-deleted (soft delete with deleted_at).
create trigger trg_files_no_delete before delete on public.files
  for each row execute function private.forbid_delete();

-- Low-res, watermarked JPG previews (what clients see).
create table public.preview_renditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  file_id uuid not null references public.files(id),
  page_no int not null default 1,
  side text check (side in ('front','back')),
  preview_path text,                            -- previews bucket: <org_id>/...
  width int,
  height int,
  source text not null default 'auto' check (source in ('auto','manual')),
  status public.rendition_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, page_no, side)
);

create table public.color_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  pantone_refs text[] not null default '{}',
  cmyk_targets jsonb not null default '{}'::jsonb,   -- {"Process Blue": {"c":100,"m":0,"y":0,"k":0}}
  paper_stock text,
  press_machine text,
  notes text,
  approved_by_name text,                              -- may be a client person without a login
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.print_items
  add constraint print_items_color_standard_fk foreign key (color_standard_id) references public.color_standards(id);

create table public.color_standard_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  color_standard_id uuid not null references public.color_standards(id),
  file_id uuid not null references public.files(id),
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null,
  style text not null default 'normal',
  weight int not null default 400,
  file_id uuid references public.files(id),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family, style, weight)
);

create table public.editable_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  artwork_version_id uuid references public.artwork_versions(id),
  rendition_id uuid references public.preview_renditions(id),   -- background image
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Positions and sizes are percentages of the preview (0–100) so they line up
-- at any zoom level and on any screen.
create table public.template_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_id uuid not null references public.editable_templates(id) on delete cascade,
  page_no int not null default 1,
  key text not null,
  label text not null,
  default_text text not null default '',
  x_pct numeric(7,4) not null check (x_pct between 0 and 100),
  y_pct numeric(7,4) not null check (y_pct between 0 and 100),
  w_pct numeric(7,4) not null check (w_pct > 0 and w_pct <= 100),
  h_pct numeric(7,4) not null check (h_pct > 0 and h_pct <= 100),
  font_id uuid references public.fonts(id),
  font_size_pt numeric(6,2) not null default 10,
  color_hex text not null default '#000000' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  align text not null default 'left' check (align in ('left','center','right')),
  max_chars int check (max_chars is null or max_chars > 0),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, key)
);

commit;

-- ===== 20261125000005_revisions.sql =====
-- ============================================================================
-- 0005  Review & revise: revision requests, markups, attachments,
--       edited template values, approvals
-- ============================================================================

create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  print_item_id uuid not null references public.print_items(id),
  order_id uuid,                                    -- FK in 0007
  base_version_id uuid not null references public.artwork_versions(id),
  result_version_id uuid references public.artwork_versions(id),   -- revised proof
  round_no int not null default 1 check (round_no > 0),
  status public.revision_status not null default 'open',
  general_notes text,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  proof_sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index revision_requests_status_idx on public.revision_requests (status, submitted_at);

-- Positions are percentages of the preview image.
create table public.revision_markups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  revision_request_id uuid not null references public.revision_requests(id) on delete cascade,
  rendition_id uuid references public.preview_renditions(id),
  page_no int not null default 1,
  shape public.markup_shape not null,
  x_pct numeric(7,4) not null check (x_pct between 0 and 100),
  y_pct numeric(7,4) not null check (y_pct between 0 and 100),
  w_pct numeric(7,4) check (w_pct is null or (w_pct > 0 and w_pct <= 100)),
  h_pct numeric(7,4) check (h_pct is null or (h_pct > 0 and h_pct <= 100)),
  comment text not null,
  staff_reply text,
  staff_status public.markup_staff_status not null default 'open',
  replied_by uuid references public.profiles(id),
  replied_at timestamptz,
  sort int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shape = 'pin' or (w_pct is not null and h_pct is not null))
);

create table public.revision_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  revision_request_id uuid not null references public.revision_requests(id) on delete cascade,
  markup_id uuid references public.revision_markups(id) on delete set null,
  file_id uuid not null references public.files(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  revision_request_id uuid not null references public.revision_requests(id) on delete cascade,
  template_field_id uuid not null references public.template_fields(id),
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_request_id, template_field_id)
);

-- Permanent approval records (who, when, from where). Never edited.
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  artwork_version_id uuid not null references public.artwork_versions(id),
  revision_request_id uuid references public.revision_requests(id),
  order_id uuid,                                    -- FK in 0007
  approved_by uuid not null references public.profiles(id),
  approved_by_name text not null,
  approved_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create trigger trg_approvals_no_delete before delete on public.approvals
  for each row execute function private.forbid_delete();
create or replace function private.forbid_update()
returns trigger language plpgsql as $$
begin
  raise exception 'Rows in % cannot be changed.', tg_table_name using errcode = '42501';
end $$;
create trigger trg_approvals_no_update before update on public.approvals
  for each row execute function private.forbid_update();

commit;

-- ===== 20261125000006_pricing.sql =====
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

commit;

-- ===== 20261125000007_orders.sql =====
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

commit;

-- ===== 20261125000008_rls.sql =====
-- ============================================================================
-- 0008  Row Level Security — who can see and change what
-- ============================================================================
-- Principles
--   * Every table in `public` has RLS ON. No policy = no access.
--   * The `anon` role (signed-out visitors) gets no table access at all.
--   * A client user only ever sees rows whose organization_id is their own
--     company. Staff see what their role allows:
--       pa_admin       everything
--       pa_sales       only the client companies assigned to them
--       pa_production  all orders/items/files, but never prices or payments
--   * Money lives in separate tables, guarded by private.can_see_prices().
--   * When 2-step verification is required for a user (staff, client_admin),
--     their session must be AAL2 or every helper below returns false.
-- ============================================================================

-- ------------------------------------------------------------ helpers
create or replace function private.me_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function private.raw_staff_role()
returns public.staff_role language sql stable security definer set search_path = '' as $$
  select staff_role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function private.mfa_ok()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  required boolean;
  enforced boolean;
begin
  select coalesce((value ->> 'require_mfa')::boolean, true) into enforced
    from public.settings where key = 'security';
  if enforced is false then
    return true;
  end if;
  required := private.raw_staff_role() is not null
    or exists (select 1 from public.memberships m
               where m.profile_id = auth.uid() and m.is_active and m.client_role = 'client_admin');
  if not required then
    return true;
  end if;
  return coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
end $$;

create or replace function private.staff_role()
returns public.staff_role language sql stable security definer set search_path = '' as $$
  select case when private.mfa_ok() then private.raw_staff_role() end
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_role() is not null
$$;

create or replace function private.is_pa_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_role() = 'pa_admin'
$$;

-- admin + sales: the staff who handle prices
create or replace function private.is_price_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_role() in ('pa_admin', 'pa_sales')
$$;

create or replace function private.my_org_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id
    from public.memberships m
    join public.profiles p on p.id = m.profile_id and p.is_active
    join public.organizations o on o.id = m.organization_id and o.is_active and o.deleted_at is null
   where m.profile_id = auth.uid() and m.is_active and private.mfa_ok()
$$;

create or replace function private.client_role(org uuid)
returns public.client_role language sql stable security definer set search_path = '' as $$
  select m.client_role
    from public.memberships m
   where m.profile_id = auth.uid() and m.organization_id = org and m.is_active
     and org in (select private.my_org_ids())
$$;

create or replace function private.is_client_admin(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.client_role(org) = 'client_admin'
$$;

-- client_admin + client_buyer: can place orders and see prices
create or replace function private.can_order(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.client_role(org) in ('client_admin', 'client_buyer')
$$;

create or replace function private.is_assigned(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_assignments
                 where organization_id = org and staff_profile_id = auth.uid())
$$;

create or replace function private.staff_can_manage(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case private.staff_role()
           when 'pa_admin' then true
           when 'pa_sales' then private.is_assigned(org)
           else false end
$$;

create or replace function private.staff_can_view(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case private.staff_role()
           when 'pa_admin' then true
           when 'pa_production' then true
           when 'pa_sales' then private.is_assigned(org)
           else false end
$$;

create or replace function private.can_read_org(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select org in (select private.my_org_ids()) or private.staff_can_view(org)
$$;

create or replace function private.can_see_prices(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_order(org) or private.staff_can_manage(org)
$$;

-- Any signed-in, active user (used for global reference data like categories).
create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.me_active() and private.mfa_ok()
$$;

-- Can the current user see this profile?
create or replace function private.can_see_profile(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select pid = auth.uid()
      or private.is_pa_admin()
      -- staff can see other staff
      or (private.is_staff() and exists (select 1 from public.profiles where id = pid and staff_role is not null))
      -- clients can see the staff assigned to their company (account manager card)
      or exists (select 1 from public.staff_assignments sa
                  where sa.staff_profile_id = pid and sa.organization_id in (select private.my_org_ids()))
      -- members of a company the user can read
      or exists (select 1 from public.memberships m
                  where m.profile_id = pid and private.can_read_org(m.organization_id))
$$;

-- First folder of a storage path is the organization id: "<org_uuid>/..."
create or replace function private.path_org(object_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ------------------------------------------------- privileged column guards
create or replace function private.is_trusted_backend()
returns boolean language sql stable set search_path = '' as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
$$;

-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function private.guard_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_trusted_backend() or private.is_pa_admin() then
    return new;
  end if;
  if (new.staff_role, new.is_active, new.email, new.deactivated_at, new.deactivated_by, new.last_login_at)
     is distinct from
     (old.staff_role, old.is_active, old.email, old.deactivated_at, old.deactivated_by, old.last_login_at) then
    raise exception 'You are not allowed to change these account fields.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_profile_columns before update on public.profiles
  for each row execute function private.guard_profile_columns();

-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function private.guard_org_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_trusted_backend() or private.is_pa_admin() then
    return new;
  end if;
  if new.allow_highres_download is distinct from old.allow_highres_download then
    raise exception 'Only management (pa_admin) can change "Allow high-res download".' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.is_active is distinct from old.is_active then
    raise exception 'Only management (pa_admin) can deactivate a client company.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_org_columns before update on public.organizations
  for each row execute function private.guard_org_columns();

-- Invites by a client_admin to an email outside the company's approved
-- domains need approval by Print Amplified staff.
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function private.guard_invitation()
returns trigger language plpgsql set search_path = '' as $$
declare
  email_domain text := lower(split_part(new.email, '@', 2));
begin
  new.email := lower(trim(new.email));
  if private.is_trusted_backend() then
    return new;
  end if;
  if new.organization_id is null then
    if not private.is_pa_admin() then
      raise exception 'Only management can invite staff.' using errcode = '42501';
    end if;
    return new;
  end if;
  if private.staff_can_manage(new.organization_id) then
    if tg_op = 'UPDATE' and old.status = 'needs_approval' and new.status = 'pending' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    return new;
  end if;
  -- From here on the actor is a client_admin.
  if tg_op = 'INSERT' then
    if new.client_role is null then
      raise exception 'Choose a role for the new user.';
    end if;
    if not exists (select 1 from public.organization_domains d
                   where d.organization_id = new.organization_id and d.domain = email_domain) then
      new.status := 'needs_approval';
    else
      new.status := 'pending';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'needs_approval' and new.status = 'pending' then
      raise exception 'Print Amplified staff must approve invites to outside email addresses.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_invitation before insert or update on public.invitations
  for each row execute function private.guard_invitation();

-- ------------------------------------------------------ enable RLS everywhere
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on public.%I from anon', r.tablename);
  end loop;
end $$;
revoke all on all sequences in schema public from anon;

-- ================================================================ POLICIES
-- Naming: <table>_<action>_<who>

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (private.can_read_org(id) and (deleted_at is null or private.is_pa_admin()));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (private.is_price_staff() and created_by = auth.uid());
create policy organizations_update on public.organizations for update to authenticated
  using (private.staff_can_manage(id)) with check (private.staff_can_manage(id));
-- a sales person can see a company they have just created (before assignment)
create policy organizations_select_creator on public.organizations for select to authenticated
  using (private.is_price_staff() and created_by = auth.uid());

-- organization_domains
create policy org_domains_select on public.organization_domains for select to authenticated
  using (private.can_read_org(organization_id));
create policy org_domains_write on public.organization_domains for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.me_active()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (profile_id = auth.uid() or private.can_read_org(organization_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.staff_can_manage(organization_id));
create policy memberships_update on public.memberships for update to authenticated
  using (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id))
  with check (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id));

-- staff_assignments
create policy staff_assign_select on public.staff_assignments for select to authenticated
  using (private.staff_can_view(organization_id) or organization_id in (select private.my_org_ids()));
create policy staff_assign_insert on public.staff_assignments for insert to authenticated
  with check (
    private.is_pa_admin()
    or (private.staff_role() = 'pa_sales' and staff_profile_id = auth.uid()
        and exists (select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid()))
  );
create policy staff_assign_update on public.staff_assignments for update to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());
create policy staff_assign_delete on public.staff_assignments for delete to authenticated
  using (private.is_pa_admin());

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using ((organization_id is null and private.is_pa_admin())
      or (organization_id is not null and (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id))));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (invited_by = auth.uid() and (
       (organization_id is null and private.is_pa_admin())
    or (organization_id is not null and (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id)))));
create policy invitations_update on public.invitations for update to authenticated
  using ((organization_id is null and private.is_pa_admin())
      or (organization_id is not null and (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id))))
  with check ((organization_id is null and private.is_pa_admin())
      or (organization_id is not null and (private.staff_can_manage(organization_id) or private.is_client_admin(organization_id))));

-- auth_events / known_devices (written by the server only)
create policy auth_events_select on public.auth_events for select to authenticated
  using (profile_id = auth.uid() or private.is_pa_admin());
create policy known_devices_select on public.known_devices for select to authenticated
  using (profile_id = auth.uid() or private.is_pa_admin());
create policy known_devices_delete on public.known_devices for delete to authenticated
  using (profile_id = auth.uid() or private.is_pa_admin());

-- addresses
create policy addresses_select on public.addresses for select to authenticated
  using (private.can_read_org(organization_id) and deleted_at is null);
create policy addresses_insert on public.addresses for insert to authenticated
  with check (private.can_order(organization_id) or private.staff_can_manage(organization_id));
create policy addresses_update on public.addresses for update to authenticated
  using (private.can_order(organization_id) or private.staff_can_manage(organization_id))
  with check (private.can_order(organization_id) or private.staff_can_manage(organization_id));

-- settings
create policy settings_select on public.settings for select to authenticated
  using ((visibility in ('public','client') and private.is_active_user()) or private.is_staff());
create policy settings_write on public.settings for all to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());

-- audit_logs: readable by management; written only by the server
create policy audit_select on public.audit_logs for select to authenticated
  using (private.is_pa_admin());

-- notifications / push
create policy notifications_select on public.notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_own on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ------------------------------------------------------------- catalog
create policy categories_select on public.product_categories for select to authenticated
  using (private.is_staff() or (private.is_active_user() and is_active and deleted_at is null));
create policy categories_write on public.product_categories for all to authenticated
  using (private.is_price_staff()) with check (private.is_price_staff());

create policy products_select on public.products for select to authenticated
  using (private.is_staff() or (
    is_active and deleted_at is null and private.is_active_user() and (
      visibility = 'all'
      or exists (select 1 from public.product_visibility pv
                  where pv.product_id = products.id and pv.organization_id in (select private.my_org_ids())))));
create policy products_write on public.products for all to authenticated
  using (private.is_price_staff()) with check (private.is_price_staff());

create policy product_visibility_select on public.product_visibility for select to authenticated
  using (private.staff_can_view(organization_id) or organization_id in (select private.my_org_ids()));
create policy product_visibility_write on public.product_visibility for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy product_options_select on public.product_options for select to authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_options_write on public.product_options for all to authenticated
  using (private.is_price_staff()) with check (private.is_price_staff());

create policy standard_prices_select on public.standard_prices for select to authenticated
  using (private.is_price_staff() or (
    exists (select 1 from public.products p where p.id = product_id)
    and exists (select 1 from public.memberships m
                 where m.profile_id = auth.uid() and m.is_active
                   and m.client_role in ('client_admin','client_buyer')
                   and m.organization_id in (select private.my_org_ids()))));
create policy standard_prices_write on public.standard_prices for all to authenticated
  using (private.is_price_staff()) with check (private.is_price_staff());

-- ------------------------------------------------------------- quotes
create policy quote_requests_select on public.quote_requests for select to authenticated
  using (private.can_read_org(organization_id) and deleted_at is null);
create policy quote_requests_insert on public.quote_requests for insert to authenticated
  with check ((private.can_order(organization_id) and submitted_by = auth.uid())
           or private.staff_can_manage(organization_id));
create policy quote_requests_update on public.quote_requests for update to authenticated
  using (private.staff_can_manage(organization_id)
      or (private.can_order(organization_id) and submitted_by = auth.uid() and status in ('draft','submitted')))
  with check (private.staff_can_manage(organization_id)
      or (private.can_order(organization_id) and submitted_by = auth.uid() and status in ('draft','submitted','cancelled')));

create policy quotes_select on public.quotes for select to authenticated
  using (private.staff_can_manage(organization_id)
      or (private.can_see_prices(organization_id) and status <> 'draft'));
create policy quotes_write on public.quotes for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy quote_tiers_select on public.quote_tiers for select to authenticated
  using (private.can_see_prices(organization_id)
         and exists (select 1 from public.quotes q where q.id = quote_id));
create policy quote_tiers_write on public.quote_tiers for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy quote_messages_select on public.quote_messages for select to authenticated
  using (private.can_read_org(organization_id));
create policy quote_messages_insert on public.quote_messages for insert to authenticated
  with check (author_id = auth.uid()
              and (private.can_order(organization_id) or private.staff_can_manage(organization_id)));

create policy draft_orders_own on public.draft_orders for all to authenticated
  using (created_by = auth.uid() and organization_id in (select private.my_org_ids()))
  with check (created_by = auth.uid() and private.can_order(organization_id));
create policy draft_orders_staff_select on public.draft_orders for select to authenticated
  using (private.staff_can_manage(organization_id));

-- ------------------------------------------------- print items & artwork
create policy print_items_select on public.print_items for select to authenticated
  using (private.can_read_org(organization_id) and (deleted_at is null or private.is_pa_admin()));
create policy print_items_write on public.print_items for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy artwork_versions_select on public.artwork_versions for select to authenticated
  using (private.can_read_org(organization_id));
create policy artwork_versions_write on public.artwork_versions for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- files: clients never see rows for high-res print files or estimate originals
create policy files_select_staff on public.files for select to authenticated
  using ((organization_id is null and private.is_staff()) or private.staff_can_view(organization_id));
create policy files_select_client on public.files for select to authenticated
  using (deleted_at is null and (
      (organization_id in (select private.my_org_ids()) and bucket = 'attachments'
         and (purpose <> 'payment_slip' or private.can_see_prices(organization_id)))
   or (purpose = 'font' and private.is_active_user())));
create policy files_insert_staff on public.files for insert to authenticated
  with check (private.staff_can_manage(organization_id)
           or (organization_id is null and private.is_price_staff())
           or (private.staff_can_view(organization_id) and purpose in ('order_photo','delivery_receipt')));
create policy files_insert_client on public.files for insert to authenticated
  with check (private.can_order(organization_id) and bucket = 'attachments' and uploaded_by = auth.uid()
              and purpose in ('revision_attachment','payment_slip','quote_request_artwork'));
create policy files_update_staff on public.files for update to authenticated
  using (private.staff_can_manage(organization_id) or (organization_id is null and private.is_price_staff()))
  with check (private.staff_can_manage(organization_id) or (organization_id is null and private.is_price_staff()));

create policy renditions_select on public.preview_renditions for select to authenticated
  using (private.can_read_org(organization_id));
create policy renditions_write on public.preview_renditions for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy color_standards_select on public.color_standards for select to authenticated
  using (private.can_read_org(organization_id) and deleted_at is null);
create policy color_standards_write on public.color_standards for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy color_photos_select on public.color_standard_photos for select to authenticated
  using (private.can_read_org(organization_id));
create policy color_photos_write on public.color_standard_photos for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy fonts_select on public.fonts for select to authenticated
  using (private.is_active_user());
create policy fonts_write on public.fonts for all to authenticated
  using (private.is_price_staff()) with check (private.is_price_staff());

create policy templates_select on public.editable_templates for select to authenticated
  using (private.can_read_org(organization_id));
create policy templates_write on public.editable_templates for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy template_fields_select on public.template_fields for select to authenticated
  using (private.can_read_org(organization_id));
create policy template_fields_write on public.template_fields for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- ------------------------------------------------------------ revisions
create policy revision_requests_select on public.revision_requests for select to authenticated
  using (private.can_read_org(organization_id));
create policy revision_requests_insert on public.revision_requests for insert to authenticated
  with check ((private.can_order(organization_id) and submitted_by = auth.uid())
           or private.staff_can_manage(organization_id));
create policy revision_requests_update on public.revision_requests for update to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create or replace function private.revision_is_open(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.revision_requests where id = rid and status = 'open')
$$;
grant execute on function private.revision_is_open(uuid) to authenticated;

create policy markups_select on public.revision_markups for select to authenticated
  using (private.can_read_org(organization_id));
create policy markups_client_write on public.revision_markups for all to authenticated
  using (private.can_order(organization_id) and created_by = auth.uid() and private.revision_is_open(revision_request_id))
  with check (private.can_order(organization_id) and created_by = auth.uid() and private.revision_is_open(revision_request_id));
create policy markups_staff_write on public.revision_markups for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy rev_attach_select on public.revision_attachments for select to authenticated
  using (private.can_read_org(organization_id));
create policy rev_attach_write on public.revision_attachments for insert to authenticated
  with check ((private.can_order(organization_id) and private.revision_is_open(revision_request_id))
           or private.staff_can_manage(organization_id));

create policy field_values_select on public.template_field_values for select to authenticated
  using (private.can_read_org(organization_id));
create policy field_values_client_write on public.template_field_values for all to authenticated
  using (private.can_order(organization_id) and private.revision_is_open(revision_request_id))
  with check (private.can_order(organization_id) and private.revision_is_open(revision_request_id));
create policy field_values_staff_write on public.template_field_values for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- approvals are written only by the server (records IP); readable by the company
create policy approvals_select on public.approvals for select to authenticated
  using (private.can_read_org(organization_id));

-- ---------------------------------------------------- estimates & pricing
create policy past_estimates_staff on public.past_estimates for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));
create policy past_estimate_lines_staff on public.past_estimate_lines for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));
create policy past_estimate_charges_staff on public.past_estimate_charges for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy price_tiers_select on public.price_tiers for select to authenticated
  using (private.can_see_prices(organization_id));
create policy price_tiers_insert on public.price_tiers for insert to authenticated
  with check (private.staff_can_manage(organization_id));
create policy price_tiers_update on public.price_tiers for update to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy price_history_select on public.price_history for select to authenticated
  using (private.staff_can_manage(organization_id));

create policy inflation_select on public.inflation_rates for select to authenticated using (private.is_price_staff());
create policy inflation_write on public.inflation_rates for insert to authenticated with check (private.is_pa_admin());
create policy inflation_update on public.inflation_rates for update to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());
create policy surcharges_select on public.category_surcharges for select to authenticated using (private.is_price_staff());
create policy surcharges_write on public.category_surcharges for all to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());
create policy addons_select on public.fixed_addons for select to authenticated using (private.is_price_staff());
create policy addons_write on public.fixed_addons for all to authenticated
  using (private.is_pa_admin()) with check (private.is_pa_admin());
create policy pricing_settings_select on public.pricing_settings for select to authenticated using (private.is_price_staff());
create policy pricing_settings_insert on public.pricing_settings for insert to authenticated with check (private.is_pa_admin());

create policy instant_quotes_select on public.instant_quotes for select to authenticated
  using (private.staff_can_manage(organization_id)
      or (private.can_see_prices(organization_id) and status in ('offered','accepted','expired')));
create policy instant_quotes_write on public.instant_quotes for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- --------------------------------------------------------------- orders
create policy orders_select on public.orders for select to authenticated
  using (private.can_read_org(organization_id) and (deleted_at is null or private.is_pa_admin()));
create policy orders_insert on public.orders for insert to authenticated
  with check ((private.can_order(organization_id) and placed_by = auth.uid() and status = 'submitted')
           or private.staff_can_manage(organization_id));
create policy orders_update on public.orders for update to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy order_items_select on public.order_items for select to authenticated
  using (private.can_read_org(organization_id));
create policy order_items_insert on public.order_items for insert to authenticated
  with check (private.staff_can_manage(organization_id)
    or (private.can_order(organization_id) and exists (
          select 1 from public.orders o where o.id = order_id and o.placed_by = auth.uid() and o.status = 'submitted')));
create policy order_items_update on public.order_items for update to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

-- prices on orders are written by staff or by the server, never by the client
create policy order_item_prices_select on public.order_item_prices for select to authenticated
  using (private.can_see_prices(organization_id));
create policy order_item_prices_write on public.order_item_prices for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));
create policy order_financials_select on public.order_financials for select to authenticated
  using (private.can_see_prices(organization_id));
create policy order_financials_write on public.order_financials for all to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy status_events_select on public.order_status_events for select to authenticated
  using (private.can_read_org(organization_id) and (client_visible or private.is_staff()));

create policy order_attachments_select on public.order_attachments for select to authenticated
  using (private.can_read_org(organization_id));
create policy order_attachments_insert on public.order_attachments for insert to authenticated
  with check (private.staff_can_view(organization_id));

create policy payments_select on public.payments for select to authenticated
  using (private.can_see_prices(organization_id) and deleted_at is null);
create policy payments_insert on public.payments for insert to authenticated
  with check (private.staff_can_manage(organization_id) and recorded_by = auth.uid());
create policy payments_update on public.payments for update to authenticated
  using (private.staff_can_manage(organization_id)) with check (private.staff_can_manage(organization_id));

create policy payment_slips_select on public.payment_slips for select to authenticated
  using (private.can_see_prices(organization_id));
create policy payment_slips_insert on public.payment_slips for insert to authenticated
  with check ((private.can_order(organization_id) and uploaded_by = auth.uid())
           or private.staff_can_manage(organization_id));

-- order_number_counters: no policies -> only the server/trigger can use it.

commit;

-- ===== 20261125000009_storage.sql =====
-- ============================================================================
-- 0009  Storage buckets and their access rules
-- ============================================================================
-- Object paths always start with the client company id:
--     <organization_id>/<print_item_id>/<version>/<file>
--
--   print-files  high-res print files            staff only (never clients)
--   previews     low-res watermarked JPGs        staff + that company (signed URLs)
--   attachments  client uploads, order photos    staff + that company
--                (payment slips under <org>/payment-slips/ need price access)
--   assets       fonts, catalog photos           any signed-in user; staff write
--   brand        logo / login-page images        public read; pa_admin write
--
-- File size limit: 50 MB per file while on the Supabase FREE plan (the
-- maximum it allows). On Pro, raise it to 100 MB:
--   update storage.buckets set file_size_limit = 104857600
--    where id in ('print-files','attachments');
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('print-files', 'print-files', false, 52428800),
  ('previews',    'previews',    false, 10485760),
  ('attachments', 'attachments', false, 52428800),
  ('assets',      'assets',      false, 20971520),
  ('brand',       'brand',       true,  5242880)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- print-files: staff only
create policy pf_select on storage.objects for select to authenticated
  using (bucket_id = 'print-files' and private.staff_can_view(private.path_org(name)));
create policy pf_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)));
create policy pf_update on storage.objects for update to authenticated
  using (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)))
  with check (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)));
-- no delete policy: print files are never deleted through the API

-- previews: the company can read its own; staff write
create policy pv_select on storage.objects for select to authenticated
  using (bucket_id = 'previews' and private.can_read_org(private.path_org(name)));
create policy pv_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));
create policy pv_update on storage.objects for update to authenticated
  using (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)))
  with check (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));
create policy pv_delete on storage.objects for delete to authenticated
  using (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));

-- attachments
create policy at_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_org(private.path_org(name))
         and ((storage.foldername(name))[2] is distinct from 'payment-slips'
              or private.can_see_prices(private.path_org(name))));
create policy at_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
       private.can_order(private.path_org(name))
    or private.staff_can_view(private.path_org(name))));

-- assets
create policy as_select on storage.objects for select to authenticated
  using (bucket_id = 'assets' and private.is_active_user());
create policy as_write on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and private.is_price_staff());
create policy as_update on storage.objects for update to authenticated
  using (bucket_id = 'assets' and private.is_price_staff())
  with check (bucket_id = 'assets' and private.is_price_staff());

-- brand (public bucket: reads are served without a policy)
create policy br_write on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and private.is_pa_admin());
create policy br_update on storage.objects for update to authenticated
  using (bucket_id = 'brand' and private.is_pa_admin())
  with check (bucket_id = 'brand' and private.is_pa_admin());

commit;

-- ===== 20261125000010_defaults.sql =====
-- ============================================================================
-- 0010  Default settings for a brand-new (live) project.
--       Safe to re-run: existing values are never overwritten.
-- ============================================================================

insert into public.settings (key, value, visibility, description) values
('company', '{"name":"Print Amplified","legal_name":"","address":"","phone":"","email":"","website":"https://www.printamplified.com"}',
  'public', 'Company details shown in the app, emails and quotes'),
('branding', '{"primary":"#00AEBF","accent":"#E0295A","logo_path":null}', 'public', 'Logo and brand colours'),
('payment_instructions', '{"bank_accounts":[],"cheque_payee":"","notes":""}', 'client', 'Bank details and cheque payee shown on every order'),
('email', '{"from_name":"Print Amplified","from_email":"orders@order.printamplified.com","reply_to":""}', 'staff', 'Sender details for notification emails'),
('security', '{"require_mfa":true,"web_session_hours":12,"app_session_days":30,"lockout_max_attempts":5,"lockout_minutes":15}',
  'staff', 'Login security'),
('uploads', '{"max_file_mb":50}', 'client', 'Maximum upload size (50 MB on Supabase Free; 100 MB on Pro)'),
('features', '{"ai_autofill_enabled":false}', 'staff', 'Optional paid features')
on conflict (key) do nothing;

insert into public.pricing_settings (version_no, rounding_step_pesos, rounding_scope, vat_rate_pct, quote_validity_days,
  max_estimate_age_years, max_adjustment_pct, show_breakdown_to_clients, quote_reply_target_hours, effective_from)
values (1, 5, 'order_total', 12.00, 15, 3.0, 20.00, false, 24, '2020-01-01')
on conflict (version_no) do nothing;

-- Suggested starting values: PSA headline inflation (annual averages).
-- Marked "needs confirmation" — management must verify and edit them.
insert into public.inflation_rates (year, rate_pct, source_note, needs_confirmation, effective_from)
select v.year, v.rate, v.note, true, '2020-01-01'
from (values
  (2019, 2.400, 'PSA headline inflation (annual average) — please confirm'),
  (2020, 2.400, 'PSA headline inflation (annual average) — please confirm'),
  (2021, 3.900, 'PSA headline inflation (annual average) — please confirm'),
  (2022, 5.800, 'PSA headline inflation (annual average) — please confirm'),
  (2023, 6.000, 'PSA headline inflation (annual average) — please confirm'),
  (2024, 3.200, 'PSA headline inflation (annual average) — please confirm'),
  (2025, 1.700, 'PSA headline inflation (annual average) — please confirm'),
  (2026, 2.000, 'Placeholder for the current year — management to set')
) as v(year, rate, note)
where not exists (select 1 from public.inflation_rates);

commit;

-- ===== 20261126000011_artwork_approval.sql =====
-- ============================================================================
-- 0011  Artwork versions: create a new version, approve a version.
-- ============================================================================
-- Both run as one database transaction, so an item can never end up with
-- two "Approved for Print" versions or none in the middle of a change.
-- ============================================================================

-- Next version for an item (staff who manage the client only).
create or replace function public.create_artwork_version(p_print_item_id uuid, p_change_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_no int;
  v_id uuid;
begin
  select organization_id into v_org from public.print_items where id = p_print_item_id and deleted_at is null;
  if v_org is null or not private.staff_can_manage(v_org) then
    raise exception 'Print Item not found.' using errcode = '42501';
  end if;
  perform 1 from public.print_items where id = p_print_item_id for update;  -- serialise version numbers
  select coalesce(max(version_no), 0) + 1 into v_no from public.artwork_versions where print_item_id = p_print_item_id;
  insert into public.artwork_versions (organization_id, print_item_id, version_no, change_notes, status, uploaded_by)
  values (v_org, p_print_item_id, v_no, nullif(trim(p_change_notes), ''), 'draft', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Mark a version "Approved for Print". The previous approved version becomes
-- "superseded" (kept forever in history). Records who approved, when, and
-- from where. Phase 3 extends this to client approvals of revised proofs.
create or replace function public.approve_artwork_version(p_version_id uuid, p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.artwork_versions%rowtype;
  v_name text;
  v_approval uuid;
begin
  select * into v from public.artwork_versions where id = p_version_id for update;
  if v.id is null or not private.staff_can_manage(v.organization_id) then
    raise exception 'Version not found.' using errcode = '42501';
  end if;
  if v.status = 'approved' then
    raise exception 'This version is already Approved for Print.';
  end if;
  if v.status = 'superseded' then
    raise exception 'An older version cannot be approved again. Create a new version instead.';
  end if;
  if not exists (select 1 from public.files where artwork_version_id = v.id and deleted_at is null) then
    raise exception 'Add at least one file or Drive link before approving.';
  end if;

  update public.artwork_versions set status = 'superseded'
   where print_item_id = v.print_item_id and status = 'approved';
  update public.artwork_versions set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = v.id;
  update public.print_items set approved_version_id = v.id, updated_at = now() where id = v.print_item_id;

  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
  insert into public.approvals (organization_id, artwork_version_id, approved_by, approved_by_name, ip, user_agent)
  values (v.organization_id, v.id, auth.uid(), coalesce(v_name, 'Unknown'),
          case when p_ip ~ '^[0-9a-fA-F:.]+$' then p_ip::inet end, left(p_user_agent, 500))
  returning id into v_approval;
  return v_approval;
end $$;

revoke all on function public.create_artwork_version(uuid, text) from public, anon;
revoke all on function public.approve_artwork_version(uuid, text, text) from public, anon;
grant execute on function public.create_artwork_version(uuid, text) to authenticated;
grant execute on function public.approve_artwork_version(uuid, text, text) to authenticated;

-- Files on a LOCKED (approved/superseded) version can't be added or removed.
-- One exception: uploading the archive copy of a Drive-link-only file, so
-- every approved version can end up with a real stored copy.
create or replace function private.guard_files_on_locked_version()
returns trigger language plpgsql set search_path = '' as $$
declare
  locked boolean;
begin
  if new.artwork_version_id is null then return new; end if;
  select is_locked into locked from public.artwork_versions where id = new.artwork_version_id;
  if not coalesce(locked, false) then return new; end if;
  if tg_op = 'INSERT' then
    if new.kind = 'upload' and exists (
      select 1 from public.files f where f.artwork_version_id = new.artwork_version_id
        and f.kind = 'drive_link' and f.copied_to_archive_at is null and f.deleted_at is null) then
      return new;
    end if;
    raise exception 'This version is Approved for Print and locked. Create a new version to change its files.' using errcode = '42501';
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    raise exception 'Files of an approved version cannot be removed.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_files_locked before insert or update on public.files
  for each row execute function private.guard_files_on_locked_version();

commit;

-- ===== 20261127000012_revision_enum.sql =====
-- 0012  New revision status (own file: enum values must be committed before use).
alter type public.revision_status add value if not exists 'changes_requested';

commit;

-- ===== 20261127000013_revisions_workflow.sql =====
-- ============================================================================
-- 0013  Review & revise workflow
-- ============================================================================
--  Round 1: client marks up the approved artwork  -> revision "open"
--  Staff work on it                               -> "in_prepress"
--  Staff send a revised proof (a "proof" version) -> "proof_sent"
--  Client approves                                -> "approved" (version locked)
--  ...or asks for more changes                    -> "changes_requested",
--     and a new round (Revision 2, 3, …) starts on the proof.
-- ============================================================================

alter table public.revision_requests
  add column if not exists thread_id uuid references public.revision_requests(id),
  add column if not exists parent_revision_id uuid references public.revision_requests(id),
  add column if not exists proof_message text,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;
create index if not exists revision_requests_thread_idx on public.revision_requests (thread_id, round_no);

-- Page size in points (1/72 in) — lets editable-field text be sized like the printed page.
alter table public.preview_renditions
  add column if not exists page_width_pt numeric(10,2),
  add column if not exists page_height_pt numeric(10,2);
create index if not exists preview_renditions_path_idx on public.preview_renditions (preview_path);

-- Editable fields: built-in font when no font file is chosen, and the colour
-- used to cover the original text underneath the box (null = don't cover).
alter table public.template_fields
  add column if not exists font_css text not null default 'Helvetica, Arial, sans-serif',
  add column if not exists font_weight int not null default 400,
  add column if not exists cover_color text default '#FFFFFF'
    check (cover_color is null or cover_color ~ '^#[0-9A-Fa-f]{6}$');

-- ------------------------------------------------ what clients may preview
-- Clients only see previews of APPROVED (or superseded, for history) versions,
-- proofs that were SENT to them, and colour-standard photos. Never drafts.
create or replace function private.file_visible_to_client(p_file_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.files f
    left join public.artwork_versions v on v.id = f.artwork_version_id
    where f.id = p_file_id and f.deleted_at is null
      and f.organization_id in (select private.my_org_ids())
      and (
        f.purpose = 'color_standard_photo'
        or v.status in ('approved', 'superseded')
        or (v.status = 'proof' and exists (
              select 1 from public.revision_requests r where r.result_version_id = v.id and r.status in ('proof_sent', 'approved', 'changes_requested')))
      ))
$$;

create or replace function private.preview_path_visible_to_client(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.preview_renditions r
                  where r.preview_path = p_path and private.file_visible_to_client(r.file_id))
$$;
grant execute on function private.file_visible_to_client(uuid), private.preview_path_visible_to_client(text) to authenticated;

drop policy if exists renditions_select on public.preview_renditions;
create policy renditions_select on public.preview_renditions for select to authenticated
  using (private.staff_can_view(organization_id) or private.file_visible_to_client(file_id));

drop policy if exists pv_select on storage.objects;
create policy pv_select on storage.objects for select to authenticated
  using (bucket_id = 'previews' and (
    private.staff_can_view(private.path_org(name)) or private.preview_path_visible_to_client(name)));

-- Clients also must not see draft versions themselves.
drop policy if exists artwork_versions_select on public.artwork_versions;
create policy artwork_versions_select on public.artwork_versions for select to authenticated
  using (private.staff_can_view(organization_id) or (
    organization_id in (select private.my_org_ids()) and (
      status in ('approved', 'superseded')
      or (status = 'proof' and exists (select 1 from public.revision_requests r
            where r.result_version_id = artwork_versions.id and r.status in ('proof_sent', 'approved', 'changes_requested'))))));

-- Client markups/field values/attachments are written by submit_revision_request only.
drop policy if exists markups_client_write on public.revision_markups;
drop policy if exists field_values_client_write on public.template_field_values;
drop policy if exists rev_attach_write on public.revision_attachments;
create policy rev_attach_staff_write on public.revision_attachments for insert to authenticated
  with check (private.staff_can_manage(organization_id));
drop policy if exists revision_requests_insert on public.revision_requests;
create policy revision_requests_insert on public.revision_requests for insert to authenticated
  with check (private.staff_can_manage(organization_id));

-- ----------------------------------------------------------- helpers
create or replace function private.notify_org_users(p_org uuid, p_roles public.client_role[], p_kind text, p_title text, p_body text, p_link text, p_also uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, organization_id, kind, title, body, link)
  select distinct m.profile_id, p_org, p_kind, p_title, p_body, p_link
    from public.memberships m join public.profiles p on p.id = m.profile_id and p.is_active
   where m.organization_id = p_org and m.is_active and (m.client_role = any (p_roles) or m.profile_id = p_also)
$$;

create or replace function private.notify_org_staff(p_org uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, organization_id, kind, title, body, link)
  select sa.staff_profile_id, p_org, p_kind, p_title, p_body, p_link
    from public.staff_assignments sa join public.profiles p on p.id = sa.staff_profile_id and p.is_active
   where sa.organization_id = p_org
$$;

create or replace function private.set_order_status(p_order uuid, p_to public.order_status, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_order is null then return; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.orders set status = p_to where id = p_order and status not in ('cancelled', 'closed', 'delivered') and status <> p_to;
  perform set_config('app.status_note', '', true);
end $$;

-- ------------------------------------------- 1. client submits revisions
-- p_markups:      [{ "rendition_id", "page_no", "shape": "pin"|"box", "x_pct", "y_pct", "w_pct", "h_pct", "comment", "attachment_file_ids": [] }]
-- p_field_values: [{ "template_field_id", "value" }]
-- p_attachment_file_ids: general attachments (already uploaded by the client)
create or replace function public.submit_revision_request(
  p_print_item_id uuid, p_base_version_id uuid, p_general_notes text,
  p_markups jsonb default '[]', p_field_values jsonb default '[]', p_attachment_file_ids uuid[] default '{}',
  p_order_id uuid default null, p_parent_revision_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item public.print_items%rowtype;
  v_base public.artwork_versions%rowtype;
  v_parent public.revision_requests%rowtype;
  v_round int := 1;
  v_id uuid;
  v_thread uuid;
  m jsonb;
  v_markup uuid;
  v_file uuid;
  v_name text;
begin
  select * into v_item from public.print_items where id = p_print_item_id and deleted_at is null;
  if v_item.id is null or not private.can_order(v_item.organization_id) then
    raise exception 'Print Item not found.' using errcode = '42501';
  end if;
  select * into v_base from public.artwork_versions where id = p_base_version_id and print_item_id = v_item.id;
  if v_base.id is null then raise exception 'Artwork version not found.' using errcode = '42501'; end if;

  if p_parent_revision_id is not null then
    select * into v_parent from public.revision_requests where id = p_parent_revision_id and print_item_id = v_item.id for update;
    if v_parent.id is null or v_parent.status <> 'proof_sent' or v_parent.result_version_id <> v_base.id then
      raise exception 'This proof is no longer waiting for your review.';
    end if;
    v_round := v_parent.round_no + 1;
    v_thread := coalesce(v_parent.thread_id, v_parent.id);
    update public.revision_requests set status = 'changes_requested', closed_at = now() where id = v_parent.id;
  else
    if v_base.status <> 'approved' then raise exception 'You can only request changes to the approved artwork.'; end if;
    if exists (select 1 from public.revision_requests where print_item_id = v_item.id and status in ('open', 'in_prepress', 'proof_sent')) then
      raise exception 'There is already a revision in progress for this item. Open it from My Orders or the item page.';
    end if;
  end if;

  if coalesce(jsonb_array_length(p_markups), 0) = 0 and coalesce(jsonb_array_length(p_field_values), 0) = 0
     and coalesce(nullif(trim(p_general_notes), ''), '') = '' and coalesce(array_length(p_attachment_file_ids, 1), 0) = 0 then
    raise exception 'Add at least one change: a pin, a box, an edited field, a note or a file.';
  end if;
  if jsonb_array_length(p_markups) > 100 then raise exception 'Too many markups (max 100).'; end if;

  if p_order_id is not null and not exists (
      select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
       where oi.order_id = p_order_id and oi.print_item_id = v_item.id and o.organization_id = v_item.organization_id) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  insert into public.revision_requests (organization_id, print_item_id, order_id, base_version_id, round_no, status,
      general_notes, submitted_by, thread_id, parent_revision_id)
  values (v_item.organization_id, v_item.id, coalesce(p_order_id, v_parent.order_id), v_base.id, v_round, 'open',
      nullif(trim(left(p_general_notes, 4000)), ''), auth.uid(), v_thread, p_parent_revision_id)
  returning id into v_id;
  if v_thread is null then update public.revision_requests set thread_id = v_id where id = v_id; end if;

  for m in select * from jsonb_array_elements(p_markups) loop
    if not exists (select 1 from public.preview_renditions r join public.files f on f.id = r.file_id
                    where r.id = (m ->> 'rendition_id')::uuid and f.artwork_version_id = v_base.id) then
      raise exception 'A markup points at the wrong page.';
    end if;
    insert into public.revision_markups (organization_id, revision_request_id, rendition_id, page_no, shape,
        x_pct, y_pct, w_pct, h_pct, comment, created_by, sort)
    values (v_item.organization_id, v_id, (m ->> 'rendition_id')::uuid, coalesce((m ->> 'page_no')::int, 1),
        (m ->> 'shape')::public.markup_shape, (m ->> 'x_pct')::numeric, (m ->> 'y_pct')::numeric,
        nullif(m ->> 'w_pct', '')::numeric, nullif(m ->> 'h_pct', '')::numeric,
        left(coalesce(nullif(trim(m ->> 'comment'), ''), '(no comment)'), 2000), auth.uid(), coalesce((m ->> 'sort')::int, 0))
    returning id into v_markup;
    for v_file in select (jsonb_array_elements_text(coalesce(m -> 'attachment_file_ids', '[]')))::uuid loop
      perform private.attach_revision_file(v_item.organization_id, v_id, v_markup, v_file);
    end loop;
  end loop;

  foreach v_file in array coalesce(p_attachment_file_ids, '{}') loop
    perform private.attach_revision_file(v_item.organization_id, v_id, null, v_file);
  end loop;

  insert into public.template_field_values (organization_id, revision_request_id, template_field_id, value)
  select v_item.organization_id, v_id, tf.id, left(fv ->> 'value', coalesce(tf.max_chars, 500))
    from jsonb_array_elements(p_field_values) fv
    join public.template_fields tf on tf.id = (fv ->> 'template_field_id')::uuid
    join public.editable_templates et on et.id = tf.template_id and et.print_item_id = v_item.id;

  perform private.set_order_status(coalesce(p_order_id, v_parent.order_id), 'waiting_for_revisions', format('Revision %s requested', v_round));
  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
  perform private.notify_org_staff(v_item.organization_id, 'revision_submitted',
    format('Revision %s requested: %s', v_round, v_item.name), v_name, '/staff/revisions/' || v_id);
  return v_id;
end $$;

create or replace function private.attach_revision_file(p_org uuid, p_revision uuid, p_markup uuid, p_file uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.files where id = p_file and organization_id = p_org and purpose = 'revision_attachment'
                  and uploaded_by = auth.uid() and deleted_at is null) then
    raise exception 'Attachment not found.' using errcode = '42501';
  end if;
  insert into public.revision_attachments (organization_id, revision_request_id, markup_id, file_id)
  values (p_org, p_revision, p_markup, p_file);
end $$;

-- ------------------------------------------- 2. staff send revised proof
create or replace function public.send_revised_proof(p_revision_id uuid, p_version_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.revision_requests%rowtype;
  v public.artwork_versions%rowtype;
  v_item text;
begin
  select * into r from public.revision_requests where id = p_revision_id for update;
  if r.id is null or not private.staff_can_manage(r.organization_id) then raise exception 'Revision not found.' using errcode = '42501'; end if;
  if r.status not in ('open', 'in_prepress') then raise exception 'This revision is not waiting for a proof.'; end if;
  select * into v from public.artwork_versions where id = p_version_id and print_item_id = r.print_item_id for update;
  if v.id is null or v.is_locked then raise exception 'Choose a new (unapproved) version of this item.'; end if;
  if not exists (select 1 from public.files where artwork_version_id = v.id and deleted_at is null and kind = 'upload') then
    raise exception 'Upload the revised file first.';
  end if;
  if not exists (select 1 from public.preview_renditions pr join public.files f on f.id = pr.file_id
                  where f.artwork_version_id = v.id and pr.status = 'ready') then
    raise exception 'Wait for the preview to finish (or upload a preview image) before sending.';
  end if;
  update public.artwork_versions set status = 'proof' where id = v.id;
  update public.revision_requests set status = 'proof_sent', result_version_id = v.id, proof_sent_at = now(),
         proof_message = nullif(trim(left(p_message, 2000)), '') where id = r.id;
  perform private.set_order_status(r.order_id, 'waiting_for_client_approval', format('Revised proof %s sent', r.round_no));
  select name into v_item from public.print_items where id = r.print_item_id;
  perform private.notify_org_users(r.organization_id, array['client_admin']::public.client_role[], 'proof_ready',
    format('Revised proof ready: %s', v_item), format('Revision %s — please review and approve', r.round_no),
    '/app/revisions/' || r.id, r.submitted_by);
end $$;

-- ------------------------------------------- 3. client approves the proof
create or replace function private.do_approve_version(p_version_id uuid, p_ip text, p_user_agent text, p_revision uuid, p_order uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.artwork_versions%rowtype;
  v_name text;
  v_approval uuid;
begin
  select * into v from public.artwork_versions where id = p_version_id for update;
  if v.status in ('approved', 'superseded') then raise exception 'This version cannot be approved again.'; end if;
  if not exists (select 1 from public.files where artwork_version_id = v.id and deleted_at is null) then
    raise exception 'Add at least one file or Drive link before approving.';
  end if;
  update public.artwork_versions set status = 'superseded' where print_item_id = v.print_item_id and status = 'approved';
  update public.artwork_versions set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = v.id;
  update public.print_items set approved_version_id = v.id, updated_at = now() where id = v.print_item_id;
  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
  insert into public.approvals (organization_id, artwork_version_id, revision_request_id, order_id, approved_by, approved_by_name, ip, user_agent)
  values (v.organization_id, v.id, p_revision, p_order, auth.uid(), coalesce(v_name, 'Unknown'),
          case when p_ip ~ '^[0-9a-fA-F:.]+$' then p_ip::inet end, left(p_user_agent, 500))
  returning id into v_approval;
  return v_approval;
end $$;

-- Staff approval (Phase 2) now shares the same steps.
create or replace function public.approve_artwork_version(p_version_id uuid, p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.artwork_versions%rowtype;
begin
  select * into v from public.artwork_versions where id = p_version_id;
  if v.id is null or not private.staff_can_manage(v.organization_id) then raise exception 'Version not found.' using errcode = '42501'; end if;
  if v.status = 'approved' then raise exception 'This version is already Approved for Print.'; end if;
  if v.status = 'superseded' then raise exception 'An older version cannot be approved again. Create a new version instead.'; end if;
  return private.do_approve_version(p_version_id, p_ip, p_user_agent, null, null);
end $$;

create or replace function public.approve_revised_proof(p_revision_id uuid, p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.revision_requests%rowtype;
  v_approval uuid;
  v_item text;
begin
  select * into r from public.revision_requests where id = p_revision_id for update;
  if r.id is null or not private.can_order(r.organization_id) then raise exception 'Revision not found.' using errcode = '42501'; end if;
  if r.status <> 'proof_sent' or r.result_version_id is null then raise exception 'This proof is no longer waiting for approval.'; end if;
  v_approval := private.do_approve_version(r.result_version_id, p_ip, p_user_agent, r.id, r.order_id);
  update public.revision_requests set status = 'approved', approved_by = auth.uid(), approved_at = now(), closed_at = now() where id = r.id;
  perform private.set_order_status(r.order_id, 'approved_for_print', format('Revision %s approved by client', r.round_no));
  select name into v_item from public.print_items where id = r.print_item_id;
  perform private.notify_org_staff(r.organization_id, 'proof_approved', format('Proof approved: %s', v_item),
    format('Revision %s approved — ready for print', r.round_no), '/staff/revisions/' || r.id);
  return v_approval;
end $$;

-- Staff mark a revision as being worked on, or cancel it.
create or replace function public.set_revision_status(p_revision_id uuid, p_status public.revision_status)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.revision_requests%rowtype;
begin
  select * into r from public.revision_requests where id = p_revision_id for update;
  if r.id is null or not private.staff_can_manage(r.organization_id) then raise exception 'Revision not found.' using errcode = '42501'; end if;
  if p_status not in ('in_prepress', 'cancelled') or r.status not in ('open', 'in_prepress') then
    raise exception 'This change is not possible now.';
  end if;
  update public.revision_requests set status = p_status, closed_at = case when p_status = 'cancelled' then now() end where id = r.id;
end $$;

revoke all on function public.submit_revision_request(uuid, uuid, text, jsonb, jsonb, uuid[], uuid, uuid) from public, anon;
revoke all on function public.send_revised_proof(uuid, uuid, text) from public, anon;
revoke all on function public.approve_revised_proof(uuid, text, text) from public, anon;
revoke all on function public.set_revision_status(uuid, public.revision_status) from public, anon;
revoke all on function public.approve_artwork_version(uuid, text, text) from public, anon;
grant execute on function public.submit_revision_request(uuid, uuid, text, jsonb, jsonb, uuid[], uuid, uuid),
  public.send_revised_proof(uuid, uuid, text), public.approve_revised_proof(uuid, text, text),
  public.set_revision_status(uuid, public.revision_status), public.approve_artwork_version(uuid, text, text) to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

commit;

-- ===== 20261127000014_strict_helpers.sql =====
-- ============================================================================
-- 0014  Permission helpers always answer true/false (never NULL).
-- ----------------------------------------------------------------------------
-- In row rules NULL already counts as "no", but inside functions
-- `if not private.can_order(x)` with a NULL answer would NOT stop the caller.
-- Found by tests/rls/revisions.test.ts. Every helper is now null-safe.
-- ============================================================================

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_role() is not null, false)
$$;

create or replace function private.is_pa_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_role() = 'pa_admin', false)
$$;

create or replace function private.is_price_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_role() in ('pa_admin', 'pa_sales'), false)
$$;

create or replace function private.is_client_admin(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.client_role(org) = 'client_admin', false)
$$;

create or replace function private.can_order(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.client_role(org) in ('client_admin', 'client_buyer'), false)
$$;

create or replace function private.staff_can_manage(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(case private.staff_role()
           when 'pa_admin' then true
           when 'pa_sales' then private.is_assigned(org)
           else false end, false)
$$;

create or replace function private.staff_can_view(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(case private.staff_role()
           when 'pa_admin' then true
           when 'pa_production' then true
           when 'pa_sales' then private.is_assigned(org)
           else false end, false)
$$;

create or replace function private.can_read_org(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(org in (select private.my_org_ids()), false) or private.staff_can_view(org)
$$;

create or replace function private.can_see_prices(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_order(org) or private.staff_can_manage(org)
$$;

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.me_active() and private.mfa_ok(), false)
$$;

commit;

-- ===== 20261128000015_orders_quotes.sql =====
-- ============================================================================
-- 0015  New orders and quotes
-- ============================================================================

-- ---------------------------------------------------------- numbering
create table if not exists public.doc_counters (
  kind text not null, year int not null, last_value int not null default 0,
  primary key (kind, year)
);
alter table public.doc_counters enable row level security;  -- no policies: functions only
revoke all on public.doc_counters from anon, authenticated;

create or replace function private.next_doc_no(p_kind text, p_prefix text, p_width int)
returns text language plpgsql security definer set search_path = '' as $$
declare y int := extract(year from (now() at time zone 'Asia/Manila'))::int; n int;
begin
  insert into public.doc_counters (kind, year, last_value) values (p_kind, y, 1)
  on conflict (kind, year) do update set last_value = public.doc_counters.last_value + 1
  returning last_value into n;
  return format('%s-%s-%s', p_prefix, y, lpad(n::text, p_width, '0'));
end $$;

create or replace function private.set_request_no() returns trigger language plpgsql as $$
begin
  if new.request_no is null then new.request_no := private.next_doc_no('quote_request', 'QR', 4); end if;
  if new.submitted_at is null and new.status = 'submitted' then new.submitted_at := now(); end if;
  if new.reply_due_at is null and new.status = 'submitted' then
    new.reply_due_at := now() + make_interval(hours => coalesce(
      (select quote_reply_target_hours from public.pricing_settings order by version_no desc limit 1), 24));
  end if;
  return new;
end $$;
create trigger trg_set_request_no before insert or update of status on public.quote_requests
  for each row execute function private.set_request_no();

create or replace function private.set_quote_no() returns trigger language plpgsql as $$
begin
  if new.quote_no is null then new.quote_no := private.next_doc_no('quote', 'Q', 4); end if;
  return new;
end $$;
create trigger trg_set_quote_no before insert on public.quotes for each row execute function private.set_quote_no();

-- Client artwork for new orders lives with the order.
alter table public.order_attachments drop constraint if exists order_attachments_kind_check;
alter table public.order_attachments add constraint order_attachments_kind_check
  check (kind in ('production_photo','delivery_photo','delivery_receipt','client_artwork','other'));
alter table public.orders add column if not exists needs_design_help boolean not null default false;
alter table public.orders add column if not exists artwork_links text[] not null default '{}';
alter table public.quote_requests add column if not exists artwork_links text[] not null default '{}';
alter table public.quote_requests add column if not exists artwork_file_ids uuid[] not null default '{}';

-- VAT helper: split a total into net + VAT (centavos), rounding half up.
create or replace function private.vat_split(p_amount bigint, p_inclusive boolean, p_rate numeric)
returns table (net bigint, vat bigint, total bigint) language sql immutable as $$
  select
    case when p_inclusive then p_amount - round(p_amount - p_amount / (1 + p_rate / 100))::bigint else p_amount end,
    case when p_inclusive then round(p_amount - p_amount / (1 + p_rate / 100))::bigint else round(p_amount * p_rate / 100)::bigint end,
    case when p_inclusive then p_amount else p_amount + round(p_amount * p_rate / 100)::bigint end
$$;

create or replace function private.current_vat_rate() returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select vat_rate_pct from public.pricing_settings order by version_no desc limit 1), 12)
$$;

create or replace function private.address_snapshot(p_address uuid, p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('label', label, 'recipient', recipient, 'phone', phone, 'line1', line1, 'line2', line2,
           'barangay', barangay, 'city', city, 'province', province, 'zip', zip)
    from public.addresses where id = p_address and organization_id = p_org and deleted_at is null
$$;

-- Attach client-uploaded artwork (attachments bucket) to an order.
create or replace function private.attach_order_files(p_org uuid, p_order uuid, p_files uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  foreach f in array coalesce(p_files, '{}') loop
    if not exists (select 1 from public.files where id = f and organization_id = p_org and purpose = 'quote_request_artwork'
                    and uploaded_by = auth.uid() and deleted_at is null) then
      raise exception 'Attachment not found.' using errcode = '42501';
    end if;
    insert into public.order_attachments (organization_id, order_id, kind, file_id, uploaded_by) values (p_org, p_order, 'client_artwork', f, auth.uid());
  end loop;
end $$;

-- ------------------------------------- 1. order at a standard catalog price
-- The price and the specs come from the standard_prices row — never from the
-- browser — so a client cannot change what they pay.
create or replace function public.place_standard_order(
  p_standard_price_id uuid, p_address_id uuid, p_requested_date date, p_client_po text, p_notes text,
  p_artwork_file_ids uuid[] default '{}', p_artwork_links text[] default '{}', p_needs_design boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sp public.standard_prices%rowtype;
  v_org uuid;
  v_product public.products%rowtype;
  v_order uuid;
  v_item uuid;
  s record;
begin
  select m.organization_id into v_org from public.memberships m
   where m.profile_id = auth.uid() and m.is_active and private.can_order(m.organization_id) limit 1;
  if v_org is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into sp from public.standard_prices where id = p_standard_price_id and is_active
     and (valid_until is null or valid_until >= (now() at time zone 'Asia/Manila')::date);
  if sp.id is null then raise exception 'This price is no longer available. Please request a quote.'; end if;
  -- product must be visible to this client
  select * into v_product from public.products where id = sp.product_id and is_active and deleted_at is null
     and (visibility = 'all' or exists (select 1 from public.product_visibility pv where pv.product_id = sp.product_id and pv.organization_id = v_org));
  if v_product.id is null then raise exception 'Product not found.' using errcode = '42501'; end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, v_org) is null then raise exception 'Address not found.'; end if;
  if coalesce(array_length(p_artwork_file_ids, 1), 0) = 0 and coalesce(array_length(p_artwork_links, 1), 0) = 0 and not p_needs_design then
    raise exception 'Attach your artwork, add a Drive link, or tick "I need design / layout help".';
  end if;

  insert into public.orders (organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot,
      requested_delivery_date, notes, placed_by, needs_design_help, artwork_links)
  values (v_org, '', 'new', 'submitted', nullif(trim(p_client_po), ''), p_address_id, private.address_snapshot(p_address_id, v_org),
      p_requested_date, nullif(trim(left(p_notes, 2000)), ''), auth.uid(), p_needs_design,
      (select coalesce(array_agg(l), '{}') from unnest(p_artwork_links) l where l ~ '^https://(drive|docs)\.google\.com/'))
  returning id into v_order;

  insert into public.order_items (organization_id, order_id, product_id, title, quantity, spec_snapshot)
  values (v_org, v_order, v_product.id, v_product.name, sp.quantity, sp.spec) returning id into v_item;
  insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
  values (v_item, v_org, sp.unit_price, sp.total_centavos, sp.vat_inclusive, 'standard');
  select * into s from private.vat_split(sp.total_centavos, sp.vat_inclusive, private.current_vat_rate());
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos)
  values (v_order, v_org, s.net, s.vat, s.total);
  perform private.attach_order_files(v_org, v_order, p_artwork_file_ids);
  perform private.notify_org_staff(v_org, 'order_submitted', 'New order to confirm', v_product.name, '/staff/orders/' || v_order);
  return v_order;
end $$;

-- ------------------------------------------- 1b. client asks for a quote
create or replace function public.submit_quote_request(
  p_product_id uuid, p_title text, p_spec jsonb, p_quantities int[], p_address_id uuid, p_requested_date date,
  p_client_po text, p_notes text, p_artwork_file_ids uuid[] default '{}', p_artwork_links text[] default '{}',
  p_needs_design boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; f uuid;
begin
  select m.organization_id into v_org from public.memberships m
   where m.profile_id = auth.uid() and m.is_active and private.can_order(m.organization_id) limit 1;
  if v_org is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if not exists (select 1 from public.products where id = p_product_id and is_active and deleted_at is null
     and (visibility = 'all' or exists (select 1 from public.product_visibility pv where pv.product_id = p_product_id and pv.organization_id = v_org))) then
    raise exception 'Product not found.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_quantities, 1), 0) = 0 or exists (select 1 from unnest(p_quantities) q where q is null or q <= 0 or q > 10000000) then
    raise exception 'Enter at least one quantity.';
  end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, v_org) is null then raise exception 'Address not found.'; end if;
  foreach f in array coalesce(p_artwork_file_ids, '{}') loop
    if not exists (select 1 from public.files where id = f and organization_id = v_org and purpose = 'quote_request_artwork' and uploaded_by = auth.uid()) then
      raise exception 'Attachment not found.' using errcode = '42501';
    end if;
  end loop;
  insert into public.quote_requests (organization_id, kind, product_id, title, spec, quantities, needs_design_help,
      requested_delivery_date, delivery_address_id, client_po_no, notes, status, submitted_by, artwork_file_ids, artwork_links)
  values (v_org, 'new', p_product_id, left(trim(p_title), 160), coalesce(p_spec, '{}'), (select array_agg(distinct q order by q) from unnest(p_quantities) q),
      p_needs_design, p_requested_date, p_address_id, nullif(trim(p_client_po), ''), nullif(trim(left(p_notes, 2000)), ''), 'submitted', auth.uid(),
      coalesce(p_artwork_file_ids, '{}'), (select coalesce(array_agg(l), '{}') from unnest(p_artwork_links) l where l ~ '^https://(drive|docs)\.google\.com/'))
  returning id into v_id;
  perform private.notify_org_staff(v_org, 'quote_requested', 'New quote request', p_title, '/staff/quotes/' || v_id);
  return v_id;
end $$;

-- ---------------------------------------------- 2. client accepts a quote
create or replace function public.accept_quote(p_quote_id uuid, p_tier_id uuid, p_client_po text default null, p_ip text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  r public.quote_requests%rowtype;
  t public.quote_tiers%rowtype;
  v_order uuid;
  v_item uuid;
  s record;
  v_product_name text;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.can_order(q.organization_id) or q.status not in ('sent') then
    raise exception 'This quote is not available.' using errcode = '42501';
  end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'Asia/Manila')::date then
    update public.quotes set status = 'expired' where id = q.id;
    update public.quote_requests set status = 'expired' where id = q.quote_request_id;
    raise exception 'This quote has expired. Ask your account manager for a new one.';
  end if;
  select * into t from public.quote_tiers where id = p_tier_id and quote_id = q.id;
  if t.id is null then raise exception 'Choose one of the quoted quantities.'; end if;
  select * into r from public.quote_requests where id = q.quote_request_id for update;

  insert into public.orders (organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot,
      requested_delivery_date, notes, quote_id, placed_by, confirmed_at, needs_design_help, artwork_links)
  values (q.organization_id, '', r.kind, 'confirmed', coalesce(nullif(trim(p_client_po), ''), r.client_po_no), r.delivery_address_id,
      private.address_snapshot(r.delivery_address_id, q.organization_id), r.requested_delivery_date, r.notes, q.id, auth.uid(), now(),
      r.needs_design_help, r.artwork_links)
  returning id into v_order;

  select name into v_product_name from public.products where id = r.product_id;
  insert into public.order_items (organization_id, order_id, print_item_id, product_id, title, quantity, spec_snapshot,
      artwork_version_id)
  values (q.organization_id, v_order, r.print_item_id, r.product_id, r.title, t.quantity, r.spec,
      (select approved_version_id from public.print_items where id = r.print_item_id))
  returning id into v_item;
  insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
  values (v_item, q.organization_id, t.unit_price, t.total_centavos, q.vat_inclusive, 'quote');
  select * into s from private.vat_split(t.total_centavos, q.vat_inclusive, private.current_vat_rate());
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos)
  values (v_order, q.organization_id, s.net, s.vat, s.total);
  -- the request's artwork travels with the order
  insert into public.order_attachments (organization_id, order_id, kind, file_id, uploaded_by)
  select q.organization_id, v_order, 'client_artwork', f.id, f.uploaded_by from public.files f
   where f.organization_id = q.organization_id and f.purpose = 'quote_request_artwork' and f.deleted_at is null
     and f.id = any (r.artwork_file_ids);

  update public.quote_tiers set is_selected = (id = t.id) where quote_id = q.id;
  update public.quotes set status = 'accepted', responded_by = auth.uid(), responded_at = now(),
         response_ip = case when p_ip ~ '^[0-9a-fA-F:.]+$' then p_ip::inet end where id = q.id;
  update public.quote_requests set status = 'accepted' where id = r.id;
  perform private.notify_org_staff(q.organization_id, 'quote_accepted', format('Quote %s accepted', q.quote_no),
    format('%s · %s pcs', r.title, t.quantity), '/staff/orders/' || v_order);
  return v_order;
end $$;

create or replace function public.decline_quote(p_quote_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.can_order(q.organization_id) or q.status <> 'sent' then
    raise exception 'This quote is not available.' using errcode = '42501';
  end if;
  update public.quotes set status = 'declined', responded_by = auth.uid(), responded_at = now(), decline_reason = nullif(trim(left(p_reason, 500)), '') where id = q.id;
  update public.quote_requests set status = 'declined' where id = q.quote_request_id;
  perform private.notify_org_staff(q.organization_id, 'quote_declined', format('Quote %s declined', q.quote_no), p_reason, '/staff/quotes/' || q.quote_request_id);
end $$;

-- Staff send a quote: earlier sent quotes for the same request are superseded.
create or replace function public.send_quote(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; r public.quote_requests%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.staff_can_manage(q.organization_id) or q.status <> 'draft' then
    raise exception 'Quote not found.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.quote_tiers where quote_id = q.id) then raise exception 'Add at least one quantity and price.'; end if;
  select * into r from public.quote_requests where id = q.quote_request_id for update;
  if r.status not in ('submitted', 'quoted') then raise exception 'This request is already closed.'; end if;
  update public.quotes set status = 'superseded' where quote_request_id = q.quote_request_id and status = 'sent';
  update public.quotes set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = q.id;
  update public.quote_requests set status = 'quoted' where id = r.id;
  perform private.notify_org_users(q.organization_id, array['client_admin']::public.client_role[], 'quote_ready',
    'Your quote is ready', r.title, '/app/quotes/' || r.id, r.submitted_by);
end $$;

-- ------------------------------------ 3. new order delivered -> Print Item
-- When a NEW order is delivered (or closed), each line without a Print Item
-- becomes one, with its specs and the price paid, so next time it is a reorder.
create or replace function private.create_print_items_from_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  oi record;
  v_item uuid;
  v_cat uuid;
begin
  if new.status not in ('delivered', 'closed') or old.status in ('delivered', 'closed') then return null; end if;
  for oi in select i.*, p.total_centavos, p.unit_price, p.vat_inclusive from public.order_items i
             left join public.order_item_prices p on p.order_item_id = i.id
            where i.order_id = new.id and i.print_item_id is null loop
    select category_id into v_cat from public.products where id = oi.product_id;
    insert into public.print_items (organization_id, name, category_id, product_id, spec, spec_signature, source_order_id)
    values (new.organization_id, oi.title, v_cat, oi.product_id, oi.spec_snapshot, null, new.id)
    returning id into v_item;
    insert into public.artwork_versions (organization_id, print_item_id, version_no, change_notes, status)
    values (new.organization_id, v_item, 1, format('From order %s — upload the final print file and approve it', new.order_no), 'draft');
    update public.order_items set print_item_id = v_item where id = oi.id;
    if oi.total_centavos is not null then
      insert into public.price_tiers (organization_id, print_item_id, quantity, unit_price, total_centavos, vat_inclusive, source, source_ref, base_date)
      values (new.organization_id, v_item, oi.quantity, oi.unit_price, oi.total_centavos, coalesce(oi.vat_inclusive, true), 'order', new.order_no,
              (coalesce(new.delivered_at, now()) at time zone 'Asia/Manila')::date);
    end if;
    perform private.notify_org_staff(new.organization_id, 'print_item_created', format('New Print Item from %s', new.order_no),
      format('%s — upload the final approved file', oi.title), '/staff/items/' || v_item);
  end loop;
  return null;
end $$;
create trigger trg_print_items_from_order after update of status on public.orders
  for each row execute function private.create_print_items_from_order();

revoke all on function public.submit_quote_request(uuid, text, jsonb, int[], uuid, date, text, text, uuid[], text[], boolean), public.place_standard_order(uuid, uuid, date, text, text, uuid[], text[], boolean),
  public.accept_quote(uuid, uuid, text, text), public.decline_quote(uuid, text), public.send_quote(uuid) from public, anon;
grant execute on function public.submit_quote_request(uuid, text, jsonb, int[], uuid, date, text, text, uuid[], text[], boolean), public.place_standard_order(uuid, uuid, date, text, text, uuid[], text[], boolean),
  public.accept_quote(uuid, uuid, text, text), public.decline_quote(uuid, text), public.send_quote(uuid) to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

drop policy if exists quote_requests_insert on public.quote_requests;
create policy quote_requests_insert on public.quote_requests for insert to authenticated with check (private.staff_can_manage(organization_id));

-- Clients may no longer insert orders/items directly: orders come from the
-- functions above (prices are always set by the server).
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert to authenticated with check (private.staff_can_manage(organization_id));
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items for insert to authenticated with check (private.staff_can_manage(organization_id));

-- Clients upload artwork for new orders / quote requests to the attachments bucket.
drop policy if exists files_insert_client on public.files;
create policy files_insert_client on public.files for insert to authenticated
  with check (private.can_order(organization_id) and bucket = 'attachments' and uploaded_by = auth.uid()
              and purpose in ('revision_attachment','payment_slip','quote_request_artwork'));

select private.attach_updated_at_triggers();

commit;

-- ===== 20261129000016_instant_quotes.sql =====
-- ============================================================================
-- 0016  Past estimates → agreed prices, instant quotes, one-click reorder
-- ============================================================================

alter table public.instant_quotes add column if not exists order_id uuid references public.orders(id);
alter table public.instant_quotes add column if not exists lead_time_text text;
create index if not exists instant_quotes_item_idx on public.instant_quotes (print_item_id, created_at desc);

-- ------------------------------------------- confirm a past estimate
-- Staff check the estimate's data, then confirm it. Only then do its prices
-- become the item's agreed prices (and the base of instant quotes).
create or replace function public.confirm_past_estimate(p_estimate_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare e public.past_estimates%rowtype; l record; n int := 0;
begin
  select * into e from public.past_estimates where id = p_estimate_id for update;
  if e.id is null or not private.staff_can_manage(e.organization_id) or e.deleted_at is not null then
    raise exception 'Estimate not found.' using errcode = '42501';
  end if;
  if e.print_item_id is null then raise exception 'Link the estimate to a Print Item first.'; end if;
  if not exists (select 1 from public.past_estimate_lines where past_estimate_id = e.id) then raise exception 'Add at least one quantity and price.'; end if;
  update public.past_estimates set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = e.id;
  for l in select * from public.past_estimate_lines where past_estimate_id = e.id loop
    -- a newer agreed price for the same quantity wins; never replace it with an older estimate
    if exists (select 1 from public.price_tiers where print_item_id = e.print_item_id and quantity = l.quantity and is_current and base_date > e.estimate_date) then
      continue;
    end if;
    update public.price_tiers set is_current = false where print_item_id = e.print_item_id and quantity = l.quantity and is_current;
    insert into public.price_tiers (organization_id, print_item_id, quantity, unit_price, total_centavos, vat_inclusive, source, source_ref,
        past_estimate_line_id, base_date, valid_until, created_by)
    values (e.organization_id, e.print_item_id, l.quantity, l.unit_price, l.total_centavos, e.vat_inclusive, 'estimate', e.estimate_no,
        l.id, e.estimate_date, e.valid_until, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- ----------------------------- accept one or more instant quotes as ONE order
create or replace function public.accept_instant_quotes(p_ids uuid[], p_address_id uuid, p_requested_date date,
  p_client_po text, p_notes text, p_ip text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_order uuid; v_item uuid; v_sum bigint := 0; q public.instant_quotes%rowtype; pi public.print_items%rowtype; s record;
  v_cs jsonb;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nothing to order.'; end if;
  select distinct organization_id into v_org from public.instant_quotes where id = any (p_ids);
  if v_org is null or (select count(distinct organization_id) from public.instant_quotes where id = any (p_ids)) <> 1
     or not private.can_order(v_org) then
    raise exception 'Quote not found.' using errcode = '42501';
  end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, v_org) is null then raise exception 'Address not found.'; end if;

  insert into public.orders (organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot,
      requested_delivery_date, notes, placed_by, confirmed_at, instant_quote_id)
  values (v_org, '', 'reorder', 'confirmed', nullif(trim(p_client_po), ''), p_address_id, private.address_snapshot(p_address_id, v_org),
      p_requested_date, nullif(trim(left(p_notes, 2000)), ''), auth.uid(), now(), p_ids[1])
  returning id into v_order;

  for q in select * from public.instant_quotes where id = any (p_ids) for update loop
    if q.status <> 'offered' then raise exception 'One of these quotes was already used or changed. Please refresh.'; end if;
    if q.valid_until < (now() at time zone 'Asia/Manila')::date then
      update public.instant_quotes set status = 'expired' where id = q.id;
      raise exception 'A quote has expired — prices are recalculated at today''s rates. Please refresh.';
    end if;
    select * into pi from public.print_items where id = q.print_item_id and deleted_at is null;
    if pi.approved_version_id is null then raise exception 'This item has no approved artwork.'; end if;
    select to_jsonb(cs) - 'organization_id' into v_cs from public.color_standards cs where cs.id = pi.color_standard_id;
    insert into public.order_items (organization_id, order_id, print_item_id, product_id, title, quantity, spec_snapshot, artwork_version_id, color_standard_snapshot)
    values (v_org, v_order, pi.id, pi.product_id, pi.name, q.quantity, pi.spec, pi.approved_version_id, v_cs) returning id into v_item;
    insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
    values (v_item, v_org, round(q.final_total_centavos::numeric / 100 / q.quantity, 4), q.final_total_centavos, true, 'estimate');
    update public.instant_quotes set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), order_id = v_order,
           accepted_ip = case when p_ip ~ '^[0-9a-fA-F:.]+$' then p_ip::inet end where id = q.id;
    v_sum := v_sum + q.final_total_centavos;
  end loop;
  select * into s from private.vat_split(v_sum, true, private.current_vat_rate());
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos) values (v_order, v_org, s.net, s.vat, s.total);
  perform private.notify_org_staff(v_org, 'reorder_placed', 'New reorder (instant quote)', (select order_no from public.orders where id = v_order), '/staff/orders/' || v_order);
  return v_order;
end $$;

-- ------------------------------------- reorder that needs a staff quote
create or replace function public.submit_reorder_request(p_print_item_id uuid, p_quantities int[], p_reasons text[], p_changes text,
  p_address_id uuid, p_requested_date date, p_client_po text, p_notes text, p_instant_quote_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pi public.print_items%rowtype; v_id uuid;
begin
  select * into pi from public.print_items where id = p_print_item_id and deleted_at is null;
  if pi.id is null or not private.can_order(pi.organization_id) then raise exception 'Print Item not found.' using errcode = '42501'; end if;
  if coalesce(array_length(p_quantities, 1), 0) = 0 or exists (select 1 from unnest(p_quantities) q where q is null or q <= 0 or q > 10000000) then
    raise exception 'Enter a quantity.';
  end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, pi.organization_id) is null then raise exception 'Address not found.'; end if;
  insert into public.quote_requests (organization_id, kind, product_id, print_item_id, title, spec, spec_signature, quantities,
      requested_delivery_date, delivery_address_id, client_po_no, notes, status, needs_quote_reasons, submitted_by)
  values (pi.organization_id, 'reorder', pi.product_id, pi.id, left(pi.name || ' — reorder', 160),
      case when nullif(trim(p_changes), '') is null then pi.spec else pi.spec || jsonb_build_object('requested_changes', left(trim(p_changes), 2000)) end,
      pi.spec_signature, (select array_agg(distinct q order by q) from unnest(p_quantities) q), p_requested_date, p_address_id,
      nullif(trim(p_client_po), ''), nullif(trim(left(p_notes, 2000)), ''), 'submitted',
      (select coalesce(array_agg(distinct r), '{}') from unnest(p_reasons) r where r in
        ('no_past_price','specs_changed','has_revisions','quantity_not_in_tiers','estimate_too_old','adjustment_over_limit','instant_quotes_off')),
      auth.uid())
  returning id into v_id;
  if p_instant_quote_id is not null then
    update public.instant_quotes set quote_request_id = v_id where id = p_instant_quote_id and organization_id = pi.organization_id and status = 'blocked';
  end if;
  perform private.notify_org_staff(pi.organization_id, 'reorder_needs_quote', 'Reorder needs a quote', pi.name, '/staff/quotes/' || v_id);
  return v_id;
end $$;

-- ---------------------------------------------- staff override (logged)
create or replace function public.override_instant_quote(p_id uuid, p_total_centavos bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.instant_quotes%rowtype; s record;
begin
  select * into q from public.instant_quotes where id = p_id for update;
  if q.id is null or not private.staff_can_manage(q.organization_id) then raise exception 'Quote not found.' using errcode = '42501'; end if;
  if q.status <> 'offered' then raise exception 'Only quotes not yet accepted can be changed.'; end if;
  if p_total_centavos is null or p_total_centavos <= 0 then raise exception 'Enter the new total.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the change.'; end if;
  select * into s from private.vat_split(p_total_centavos, true, private.current_vat_rate());
  update public.instant_quotes set override_old_total_centavos = coalesce(override_old_total_centavos, final_total_centavos),
         final_total_centavos = s.total, vat_centavos = s.vat, final_net_centavos = s.net,
         override_by = auth.uid(), override_reason = left(trim(p_reason), 500) where id = q.id;
end $$;

revoke all on function public.confirm_past_estimate(uuid), public.accept_instant_quotes(uuid[], uuid, date, text, text, text),
  public.submit_reorder_request(uuid, int[], text[], text, uuid, date, text, text, uuid), public.override_instant_quote(uuid, bigint, text) from public, anon;
grant execute on function public.confirm_past_estimate(uuid), public.accept_instant_quotes(uuid[], uuid, date, text, text, text),
  public.submit_reorder_request(uuid, int[], text[], text, uuid, date, text, text, uuid), public.override_instant_quote(uuid, bigint, text) to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

commit;

-- ===== 20261130000017_tracking_payments.sql =====
-- ============================================================================
-- 0017  Order tracking and payments (Phase 6)
-- ============================================================================
--  update_order_status   staff (production included) move an order along the
--                        timeline, with a note, client visibility and photos
--  confirm_order         sales/admin confirm a Submitted order, optionally
--                        adjusting item prices (totals and VAT recomputed)
--  cancel_order          client buyers while Submitted; sales/admin any time
--                        before delivery
--  record_payment        sales/admin record a bank transfer or cheque
--  void_payment          sales/admin void a wrong entry (kept, never deleted)
--  add_payment_slip      client attaches a deposit slip / cheque photo
-- Payment status always rolls up from the payments (Unpaid → Partially Paid
-- → Paid), including when an order's total changes.
-- ============================================================================

-- ------------------------------------------------ payment status roll-up
create or replace function private.refresh_payment_status(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare paid bigint; total bigint;
begin
  select coalesce(sum(amount_centavos), 0) into paid from public.payments where order_id = p_order and deleted_at is null;
  select total_centavos into total from public.order_financials where order_id = p_order;
  update public.order_financials
     set amount_paid_centavos = paid,
         payment_status = case
           when paid <= 0 then 'unpaid'::public.payment_status
           when total is not null and paid >= total then 'paid'::public.payment_status
           else 'partially_paid'::public.payment_status end
   where order_id = p_order;
end $$;

create or replace function private.rollup_payments()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_payment_status(coalesce(new.order_id, old.order_id));
  return null;
end $$;

-- ------------------------------------------------ the status timeline
-- Allowed moves. Staff may skip steps (small jobs often go straight from
-- Confirmed to Printing) but never leave Cancelled/Closed, and Delivered can
-- only be Closed. Confirming and cancelling have their own functions.
create or replace function private.status_move_ok(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select case
    when p_from = p_to then false
    when p_from in ('cancelled', 'closed') then false
    when p_from = 'delivered' then p_to = 'closed'
    when p_to in ('submitted', 'confirmed', 'cancelled') then false
    when p_from = 'submitted' then p_to = 'on_hold'
    else true end
$$;

create or replace function public.update_order_status(p_order_id uuid, p_to public.order_status, p_note text,
  p_client_visible boolean default true, p_file_ids uuid[] default '{}', p_attachment_kind text default 'production_photo')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_event uuid;
  v_label text;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null for update;
  if o.id is null or not private.staff_can_view(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if not private.status_move_ok(o.status, p_to) then
    raise exception 'An order that is % can''t be moved to %.', replace(o.status::text, '_', ' '), replace(p_to::text, '_', ' ');
  end if;
  if p_attachment_kind not in ('production_photo', 'delivery_photo', 'delivery_receipt', 'other') then raise exception 'Unknown attachment type.'; end if;
  if coalesce(array_length(p_file_ids, 1), 0) > 20 then raise exception 'Attach at most 20 files at a time.'; end if;
  if exists (select 1 from unnest(p_file_ids) f(id) where not exists (
      select 1 from public.files x where x.id = f.id and x.organization_id = o.organization_id and x.bucket = 'attachments'
        and x.purpose in ('order_photo', 'delivery_receipt') and x.deleted_at is null)) then
    raise exception 'Upload the photos again.';
  end if;

  perform set_config('app.status_note', coalesce(left(trim(p_note), 2000), ''), true);
  update public.orders set status = p_to where id = o.id;
  perform set_config('app.status_note', '', true);

  select id into v_event from public.order_status_events where order_id = o.id order by created_at desc, id desc limit 1;
  update public.order_status_events set client_visible = coalesce(p_client_visible, true) where id = v_event;
  insert into public.order_attachments (organization_id, order_id, status_event_id, kind, file_id, uploaded_by)
  select o.organization_id, o.id, v_event, p_attachment_kind, f.id, auth.uid() from unnest(p_file_ids) f(id);

  if coalesce(p_client_visible, true) then
    v_label := initcap(replace(p_to::text, '_', ' '));
    perform private.notify_org_users(o.organization_id, array['client_admin','client_buyer','client_viewer']::public.client_role[], 'order_status',
      format('%s: %s', o.order_no, v_label), nullif(trim(p_note), ''), '/app/orders/' || o.id, o.placed_by);
  end if;
  return v_event;
end $$;

-- Photos added without a status change (e.g. a delivery receipt a day later).
create or replace function public.add_order_attachments(p_order_id uuid, p_file_ids uuid[], p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_event uuid;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null;
  if o.id is null or not private.staff_can_view(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if p_kind not in ('production_photo', 'delivery_photo', 'delivery_receipt', 'other') then raise exception 'Unknown attachment type.'; end if;
  if coalesce(array_length(p_file_ids, 1), 0) = 0 then raise exception 'Choose at least one file.'; end if;
  if exists (select 1 from unnest(p_file_ids) f(id) where not exists (
      select 1 from public.files x where x.id = f.id and x.organization_id = o.organization_id and x.bucket = 'attachments'
        and x.purpose in ('order_photo', 'delivery_receipt') and x.deleted_at is null)) then
    raise exception 'Upload the photos again.';
  end if;
  insert into public.order_status_events (organization_id, order_id, from_status, to_status, note, actor_id)
  values (o.organization_id, o.id, o.status, o.status,
          coalesce(nullif(trim(p_note), ''), case p_kind when 'delivery_receipt' then 'Delivery receipt added' else 'Photos added' end), auth.uid())
  returning id into v_event;
  insert into public.order_attachments (organization_id, order_id, status_event_id, kind, file_id, uploaded_by)
  select o.organization_id, o.id, v_event, p_kind, f.id, auth.uid() from unnest(p_file_ids) f(id);
end $$;

-- ------------------------------------------------ confirm (with price adjustment)
-- p_prices: [{ "order_item_id": uuid, "total_centavos": bigint }] — only the items whose price changes.
create or replace function public.confirm_order(p_order_id uuid, p_prices jsonb default '[]', p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  r record;
  v_rate numeric := private.current_vat_rate();
  v_net bigint := 0; v_vat bigint := 0; v_total bigint := 0;
  s record;
  v_changed int := 0;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null for update;
  if o.id is null or not private.staff_can_manage(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if o.status <> 'submitted' then raise exception 'Only a Submitted order can be confirmed.'; end if;

  for r in select (e->>'order_item_id')::uuid as item_id, (e->>'total_centavos')::bigint as total from jsonb_array_elements(coalesce(p_prices, '[]')) e loop
    if r.total is null or r.total <= 0 then raise exception 'Prices must be more than zero.'; end if;
    update public.order_item_prices p
       set total_centavos = r.total,
           unit_price = round(r.total::numeric / 100 / i.quantity, 4),
           price_source = 'manual'
      from public.order_items i
     where p.order_item_id = r.item_id and i.id = r.item_id and i.order_id = o.id;
    if not found then
      insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
      select i.id, o.organization_id, round(r.total::numeric / 100 / i.quantity, 4), r.total, true, 'manual'
        from public.order_items i where i.id = r.item_id and i.order_id = o.id;
      if not found then raise exception 'Item not found on this order.'; end if;
    end if;
    v_changed := v_changed + 1;
  end loop;

  if exists (select 1 from public.order_items i where i.order_id = o.id
             and not exists (select 1 from public.order_item_prices p where p.order_item_id = i.id)) then
    raise exception 'Enter a price for every item before confirming.';
  end if;

  for r in select p.total_centavos, p.vat_inclusive from public.order_item_prices p join public.order_items i on i.id = p.order_item_id where i.order_id = o.id loop
    select * into s from private.vat_split(r.total_centavos, r.vat_inclusive, v_rate);
    v_net := v_net + s.net; v_vat := v_vat + s.vat; v_total := v_total + s.total;
  end loop;
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos)
  values (o.id, o.organization_id, v_net, v_vat, v_total)
  on conflict (order_id) do update set net_centavos = excluded.net_centavos, vat_centavos = excluded.vat_centavos, total_centavos = excluded.total_centavos;
  perform private.refresh_payment_status(o.id);

  perform set_config('app.status_note', coalesce(nullif(trim(p_note), ''), case when v_changed > 0 then 'Confirmed with an updated price' else '' end), true);
  update public.orders set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = o.id;
  perform set_config('app.status_note', '', true);

  perform private.notify_org_users(o.organization_id, array['client_admin','client_buyer']::public.client_role[], 'order_confirmed',
    format('Order %s confirmed', o.order_no), case when v_changed > 0 then 'The price was updated — please check the new total.' end, '/app/orders/' || o.id, o.placed_by);
end $$;

-- ------------------------------------------------ cancel
create or replace function public.cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_staff boolean;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null for update;
  if o.id is null then raise exception 'Order not found.' using errcode = '42501'; end if;
  v_staff := private.staff_can_manage(o.organization_id);
  if not v_staff and not private.can_order(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason.'; end if;
  if v_staff then
    if o.status in ('delivered', 'closed', 'cancelled') then raise exception 'This order can no longer be cancelled.'; end if;
  elsif o.status <> 'submitted' then
    raise exception 'This order is already confirmed. Please contact Print Amplified to cancel it.';
  end if;
  perform set_config('app.status_note', left(trim(p_reason), 2000), true);
  update public.orders set status = 'cancelled' where id = o.id;
  perform set_config('app.status_note', '', true);
  if v_staff then
    perform private.notify_org_users(o.organization_id, array['client_admin','client_buyer']::public.client_role[], 'order_cancelled',
      format('Order %s cancelled', o.order_no), p_reason, '/app/orders/' || o.id, o.placed_by);
  else
    perform private.notify_org_staff(o.organization_id, 'order_cancelled', format('Order %s cancelled by the client', o.order_no), p_reason, '/staff/orders/' || o.id);
  end if;
end $$;

-- ------------------------------------------------ payments
create or replace function public.record_payment(p_order_id uuid, p_method public.payment_method, p_reference text, p_bank text,
  p_amount_centavos bigint, p_received_on date, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_id uuid; f public.order_financials%rowtype;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null;
  if o.id is null or not private.staff_can_manage(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 then raise exception 'Enter the amount received.'; end if;
  if p_received_on is null or p_received_on > (now() at time zone 'Asia/Manila')::date then raise exception 'Enter the date the payment was received (not in the future).'; end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception '%', case p_method when 'cheque' then 'Enter the cheque number.' else 'Enter the bank reference number.' end;
  end if;
  insert into public.payments (organization_id, order_id, method, reference_no, bank, amount_centavos, received_on, notes, recorded_by)
  values (o.organization_id, o.id, p_method, left(trim(p_reference), 80), nullif(left(trim(p_bank), 80), ''), p_amount_centavos, p_received_on,
          nullif(left(trim(p_notes), 1000), ''), auth.uid())
  returning id into v_id;
  select * into f from public.order_financials where order_id = o.id;
  perform private.notify_org_users(o.organization_id, array['client_admin','client_buyer']::public.client_role[], 'payment_recorded',
    format('Payment received for %s', o.order_no),
    case f.payment_status when 'paid' then 'Your order is fully paid. Thank you!' else 'Thank you — part of the total is now paid.' end,
    '/app/orders/' || o.id, o.placed_by);
  return v_id;
end $$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_payment_id and deleted_at is null;
  if p.id is null or not private.staff_can_manage(p.organization_id) then raise exception 'Payment not found.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for removing this payment.'; end if;
  update public.payments set deleted_at = now(), notes = concat_ws(E'\n', notes, format('Voided: %s', trim(p_reason))) where id = p.id;
end $$;

-- Client attaches a deposit slip / cheque photo (already uploaded to attachments/<org>/payment-slips/…).
create or replace function public.add_payment_slip(p_order_id uuid, p_file_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; v_id uuid;
begin
  select * into o from public.orders where id = p_order_id and deleted_at is null;
  if o.id is null or not private.can_order(o.organization_id) then raise exception 'Order not found.' using errcode = '42501'; end if;
  if not exists (select 1 from public.files where id = p_file_id and organization_id = o.organization_id and purpose = 'payment_slip'
                 and bucket = 'attachments' and uploaded_by = auth.uid() and deleted_at is null) then
    raise exception 'Upload the photo again.';
  end if;
  insert into public.payment_slips (organization_id, order_id, file_id, note, uploaded_by)
  values (o.organization_id, o.id, p_file_id, nullif(left(trim(p_note), 500), ''), auth.uid()) returning id into v_id;
  perform private.notify_org_staff(o.organization_id, 'payment_slip', format('Payment slip for %s', o.order_no),
    coalesce(nullif(trim(p_note), ''), 'The client attached a deposit slip or cheque photo. Please check and record the payment.'), '/staff/orders/' || o.id);
  return v_id;
end $$;

-- Clients and production use these functions; direct writes stay staff-only.
-- A client may no longer attach slips by inserting rows directly (use add_payment_slip).
drop policy if exists payment_slips_insert on public.payment_slips;
create policy payment_slips_insert on public.payment_slips for insert to authenticated
  with check (private.staff_can_manage(organization_id));
-- Payments are written only through record_payment / void_payment.
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
-- Production may add photos only through the functions above.
drop policy if exists order_attachments_insert on public.order_attachments;
create policy order_attachments_insert on public.order_attachments for insert to authenticated
  with check (private.staff_can_manage(organization_id));

revoke all on function public.update_order_status(uuid, public.order_status, text, boolean, uuid[], text) from public, anon;
revoke all on function public.add_order_attachments(uuid, uuid[], text, text) from public, anon;
revoke all on function public.confirm_order(uuid, jsonb, text) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.record_payment(uuid, public.payment_method, text, text, bigint, date, text) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
revoke all on function public.add_payment_slip(uuid, uuid, text) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status, text, boolean, uuid[], text) to authenticated;
grant execute on function public.add_order_attachments(uuid, uuid[], text, text) to authenticated;
grant execute on function public.confirm_order(uuid, jsonb, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.record_payment(uuid, public.payment_method, text, text, bigint, date, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.add_payment_slip(uuid, uuid, text) to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

commit;

-- ===== 20261201000018_push.sql =====
-- ============================================================================
-- 0018  Web push (Phase 7)
-- ============================================================================
-- Every in-app notification can also go to the person's installed phones.
-- The server marks a notification as pushed (pushed_at) before sending, so it
-- is never sent twice even if two dispatchers run at the same time.
-- ============================================================================
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_pending_idx on public.notifications (created_at) where pushed_at is null;

-- Old, unsent notices are never pushed later (a push about yesterday is noise).
-- Existing rows count as handled.
update public.notifications set pushed_at = created_at where pushed_at is null;

alter table public.push_subscriptions add column if not exists last_used_at timestamptz;
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- A phone that was used by someone else (shared device) moves to whoever turns
-- notifications on now, so the previous person stops getting its pushes.
create or replace function public.claim_push_endpoint(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Not signed in.' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id <> auth.uid();
end $$;
revoke all on function public.claim_push_endpoint(text) from public, anon;
grant execute on function public.claim_push_endpoint(text) to authenticated;

commit;
