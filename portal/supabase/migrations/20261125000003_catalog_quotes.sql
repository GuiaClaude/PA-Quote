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
