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
