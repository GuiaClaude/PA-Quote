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
