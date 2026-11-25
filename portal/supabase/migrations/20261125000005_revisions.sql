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
