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
