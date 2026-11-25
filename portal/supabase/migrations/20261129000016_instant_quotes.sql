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
