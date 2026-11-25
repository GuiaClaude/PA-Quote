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
