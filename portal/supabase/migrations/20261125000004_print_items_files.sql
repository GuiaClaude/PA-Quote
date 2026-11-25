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
