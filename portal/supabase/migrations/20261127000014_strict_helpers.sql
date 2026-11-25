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
