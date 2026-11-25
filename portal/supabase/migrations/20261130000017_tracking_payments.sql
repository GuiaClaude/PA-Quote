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
