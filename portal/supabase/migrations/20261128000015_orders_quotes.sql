-- ============================================================================
-- 0015  New orders and quotes
-- ============================================================================

-- ---------------------------------------------------------- numbering
create table if not exists public.doc_counters (
  kind text not null, year int not null, last_value int not null default 0,
  primary key (kind, year)
);
alter table public.doc_counters enable row level security;  -- no policies: functions only
revoke all on public.doc_counters from anon, authenticated;

create or replace function private.next_doc_no(p_kind text, p_prefix text, p_width int)
returns text language plpgsql security definer set search_path = '' as $$
declare y int := extract(year from (now() at time zone 'Asia/Manila'))::int; n int;
begin
  insert into public.doc_counters (kind, year, last_value) values (p_kind, y, 1)
  on conflict (kind, year) do update set last_value = public.doc_counters.last_value + 1
  returning last_value into n;
  return format('%s-%s-%s', p_prefix, y, lpad(n::text, p_width, '0'));
end $$;

create or replace function private.set_request_no() returns trigger language plpgsql as $$
begin
  if new.request_no is null then new.request_no := private.next_doc_no('quote_request', 'QR', 4); end if;
  if new.submitted_at is null and new.status = 'submitted' then new.submitted_at := now(); end if;
  if new.reply_due_at is null and new.status = 'submitted' then
    new.reply_due_at := now() + make_interval(hours => coalesce(
      (select quote_reply_target_hours from public.pricing_settings order by version_no desc limit 1), 24));
  end if;
  return new;
end $$;
create trigger trg_set_request_no before insert or update of status on public.quote_requests
  for each row execute function private.set_request_no();

create or replace function private.set_quote_no() returns trigger language plpgsql as $$
begin
  if new.quote_no is null then new.quote_no := private.next_doc_no('quote', 'Q', 4); end if;
  return new;
end $$;
create trigger trg_set_quote_no before insert on public.quotes for each row execute function private.set_quote_no();

-- Client artwork for new orders lives with the order.
alter table public.order_attachments drop constraint if exists order_attachments_kind_check;
alter table public.order_attachments add constraint order_attachments_kind_check
  check (kind in ('production_photo','delivery_photo','delivery_receipt','client_artwork','other'));
alter table public.orders add column if not exists needs_design_help boolean not null default false;
alter table public.orders add column if not exists artwork_links text[] not null default '{}';
alter table public.quote_requests add column if not exists artwork_links text[] not null default '{}';
alter table public.quote_requests add column if not exists artwork_file_ids uuid[] not null default '{}';

-- VAT helper: split a total into net + VAT (centavos), rounding half up.
create or replace function private.vat_split(p_amount bigint, p_inclusive boolean, p_rate numeric)
returns table (net bigint, vat bigint, total bigint) language sql immutable as $$
  select
    case when p_inclusive then p_amount - round(p_amount - p_amount / (1 + p_rate / 100))::bigint else p_amount end,
    case when p_inclusive then round(p_amount - p_amount / (1 + p_rate / 100))::bigint else round(p_amount * p_rate / 100)::bigint end,
    case when p_inclusive then p_amount else p_amount + round(p_amount * p_rate / 100)::bigint end
$$;

create or replace function private.current_vat_rate() returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select vat_rate_pct from public.pricing_settings order by version_no desc limit 1), 12)
$$;

create or replace function private.address_snapshot(p_address uuid, p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('label', label, 'recipient', recipient, 'phone', phone, 'line1', line1, 'line2', line2,
           'barangay', barangay, 'city', city, 'province', province, 'zip', zip)
    from public.addresses where id = p_address and organization_id = p_org and deleted_at is null
$$;

-- Attach client-uploaded artwork (attachments bucket) to an order.
create or replace function private.attach_order_files(p_org uuid, p_order uuid, p_files uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  foreach f in array coalesce(p_files, '{}') loop
    if not exists (select 1 from public.files where id = f and organization_id = p_org and purpose = 'quote_request_artwork'
                    and uploaded_by = auth.uid() and deleted_at is null) then
      raise exception 'Attachment not found.' using errcode = '42501';
    end if;
    insert into public.order_attachments (organization_id, order_id, kind, file_id, uploaded_by) values (p_org, p_order, 'client_artwork', f, auth.uid());
  end loop;
end $$;

-- ------------------------------------- 1. order at a standard catalog price
-- The price and the specs come from the standard_prices row — never from the
-- browser — so a client cannot change what they pay.
create or replace function public.place_standard_order(
  p_standard_price_id uuid, p_address_id uuid, p_requested_date date, p_client_po text, p_notes text,
  p_artwork_file_ids uuid[] default '{}', p_artwork_links text[] default '{}', p_needs_design boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sp public.standard_prices%rowtype;
  v_org uuid;
  v_product public.products%rowtype;
  v_order uuid;
  v_item uuid;
  s record;
begin
  select m.organization_id into v_org from public.memberships m
   where m.profile_id = auth.uid() and m.is_active and private.can_order(m.organization_id) limit 1;
  if v_org is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into sp from public.standard_prices where id = p_standard_price_id and is_active
     and (valid_until is null or valid_until >= (now() at time zone 'Asia/Manila')::date);
  if sp.id is null then raise exception 'This price is no longer available. Please request a quote.'; end if;
  -- product must be visible to this client
  select * into v_product from public.products where id = sp.product_id and is_active and deleted_at is null
     and (visibility = 'all' or exists (select 1 from public.product_visibility pv where pv.product_id = sp.product_id and pv.organization_id = v_org));
  if v_product.id is null then raise exception 'Product not found.' using errcode = '42501'; end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, v_org) is null then raise exception 'Address not found.'; end if;
  if coalesce(array_length(p_artwork_file_ids, 1), 0) = 0 and coalesce(array_length(p_artwork_links, 1), 0) = 0 and not p_needs_design then
    raise exception 'Attach your artwork, add a Drive link, or tick "I need design / layout help".';
  end if;

  insert into public.orders (organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot,
      requested_delivery_date, notes, placed_by, needs_design_help, artwork_links)
  values (v_org, '', 'new', 'submitted', nullif(trim(p_client_po), ''), p_address_id, private.address_snapshot(p_address_id, v_org),
      p_requested_date, nullif(trim(left(p_notes, 2000)), ''), auth.uid(), p_needs_design,
      (select coalesce(array_agg(l), '{}') from unnest(p_artwork_links) l where l ~ '^https://(drive|docs)\.google\.com/'))
  returning id into v_order;

  insert into public.order_items (organization_id, order_id, product_id, title, quantity, spec_snapshot)
  values (v_org, v_order, v_product.id, v_product.name, sp.quantity, sp.spec) returning id into v_item;
  insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
  values (v_item, v_org, sp.unit_price, sp.total_centavos, sp.vat_inclusive, 'standard');
  select * into s from private.vat_split(sp.total_centavos, sp.vat_inclusive, private.current_vat_rate());
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos)
  values (v_order, v_org, s.net, s.vat, s.total);
  perform private.attach_order_files(v_org, v_order, p_artwork_file_ids);
  perform private.notify_org_staff(v_org, 'order_submitted', 'New order to confirm', v_product.name, '/staff/orders/' || v_order);
  return v_order;
end $$;

-- ------------------------------------------- 1b. client asks for a quote
create or replace function public.submit_quote_request(
  p_product_id uuid, p_title text, p_spec jsonb, p_quantities int[], p_address_id uuid, p_requested_date date,
  p_client_po text, p_notes text, p_artwork_file_ids uuid[] default '{}', p_artwork_links text[] default '{}',
  p_needs_design boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; f uuid;
begin
  select m.organization_id into v_org from public.memberships m
   where m.profile_id = auth.uid() and m.is_active and private.can_order(m.organization_id) limit 1;
  if v_org is null then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if not exists (select 1 from public.products where id = p_product_id and is_active and deleted_at is null
     and (visibility = 'all' or exists (select 1 from public.product_visibility pv where pv.product_id = p_product_id and pv.organization_id = v_org))) then
    raise exception 'Product not found.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_quantities, 1), 0) = 0 or exists (select 1 from unnest(p_quantities) q where q is null or q <= 0 or q > 10000000) then
    raise exception 'Enter at least one quantity.';
  end if;
  if p_address_id is not null and private.address_snapshot(p_address_id, v_org) is null then raise exception 'Address not found.'; end if;
  foreach f in array coalesce(p_artwork_file_ids, '{}') loop
    if not exists (select 1 from public.files where id = f and organization_id = v_org and purpose = 'quote_request_artwork' and uploaded_by = auth.uid()) then
      raise exception 'Attachment not found.' using errcode = '42501';
    end if;
  end loop;
  insert into public.quote_requests (organization_id, kind, product_id, title, spec, quantities, needs_design_help,
      requested_delivery_date, delivery_address_id, client_po_no, notes, status, submitted_by, artwork_file_ids, artwork_links)
  values (v_org, 'new', p_product_id, left(trim(p_title), 160), coalesce(p_spec, '{}'), (select array_agg(distinct q order by q) from unnest(p_quantities) q),
      p_needs_design, p_requested_date, p_address_id, nullif(trim(p_client_po), ''), nullif(trim(left(p_notes, 2000)), ''), 'submitted', auth.uid(),
      coalesce(p_artwork_file_ids, '{}'), (select coalesce(array_agg(l), '{}') from unnest(p_artwork_links) l where l ~ '^https://(drive|docs)\.google\.com/'))
  returning id into v_id;
  perform private.notify_org_staff(v_org, 'quote_requested', 'New quote request', p_title, '/staff/quotes/' || v_id);
  return v_id;
end $$;

-- ---------------------------------------------- 2. client accepts a quote
create or replace function public.accept_quote(p_quote_id uuid, p_tier_id uuid, p_client_po text default null, p_ip text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  r public.quote_requests%rowtype;
  t public.quote_tiers%rowtype;
  v_order uuid;
  v_item uuid;
  s record;
  v_product_name text;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.can_order(q.organization_id) or q.status not in ('sent') then
    raise exception 'This quote is not available.' using errcode = '42501';
  end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'Asia/Manila')::date then
    update public.quotes set status = 'expired' where id = q.id;
    update public.quote_requests set status = 'expired' where id = q.quote_request_id;
    raise exception 'This quote has expired. Ask your account manager for a new one.';
  end if;
  select * into t from public.quote_tiers where id = p_tier_id and quote_id = q.id;
  if t.id is null then raise exception 'Choose one of the quoted quantities.'; end if;
  select * into r from public.quote_requests where id = q.quote_request_id for update;

  insert into public.orders (organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot,
      requested_delivery_date, notes, quote_id, placed_by, confirmed_at, needs_design_help, artwork_links)
  values (q.organization_id, '', r.kind, 'confirmed', coalesce(nullif(trim(p_client_po), ''), r.client_po_no), r.delivery_address_id,
      private.address_snapshot(r.delivery_address_id, q.organization_id), r.requested_delivery_date, r.notes, q.id, auth.uid(), now(),
      r.needs_design_help, r.artwork_links)
  returning id into v_order;

  select name into v_product_name from public.products where id = r.product_id;
  insert into public.order_items (organization_id, order_id, print_item_id, product_id, title, quantity, spec_snapshot,
      artwork_version_id)
  values (q.organization_id, v_order, r.print_item_id, r.product_id, r.title, t.quantity, r.spec,
      (select approved_version_id from public.print_items where id = r.print_item_id))
  returning id into v_item;
  insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source)
  values (v_item, q.organization_id, t.unit_price, t.total_centavos, q.vat_inclusive, 'quote');
  select * into s from private.vat_split(t.total_centavos, q.vat_inclusive, private.current_vat_rate());
  insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos)
  values (v_order, q.organization_id, s.net, s.vat, s.total);
  -- the request's artwork travels with the order
  insert into public.order_attachments (organization_id, order_id, kind, file_id, uploaded_by)
  select q.organization_id, v_order, 'client_artwork', f.id, f.uploaded_by from public.files f
   where f.organization_id = q.organization_id and f.purpose = 'quote_request_artwork' and f.deleted_at is null
     and f.id = any (r.artwork_file_ids);

  update public.quote_tiers set is_selected = (id = t.id) where quote_id = q.id;
  update public.quotes set status = 'accepted', responded_by = auth.uid(), responded_at = now(),
         response_ip = case when p_ip ~ '^[0-9a-fA-F:.]+$' then p_ip::inet end where id = q.id;
  update public.quote_requests set status = 'accepted' where id = r.id;
  perform private.notify_org_staff(q.organization_id, 'quote_accepted', format('Quote %s accepted', q.quote_no),
    format('%s · %s pcs', r.title, t.quantity), '/staff/orders/' || v_order);
  return v_order;
end $$;

create or replace function public.decline_quote(p_quote_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.can_order(q.organization_id) or q.status <> 'sent' then
    raise exception 'This quote is not available.' using errcode = '42501';
  end if;
  update public.quotes set status = 'declined', responded_by = auth.uid(), responded_at = now(), decline_reason = nullif(trim(left(p_reason, 500)), '') where id = q.id;
  update public.quote_requests set status = 'declined' where id = q.quote_request_id;
  perform private.notify_org_staff(q.organization_id, 'quote_declined', format('Quote %s declined', q.quote_no), p_reason, '/staff/quotes/' || q.quote_request_id);
end $$;

-- Staff send a quote: earlier sent quotes for the same request are superseded.
create or replace function public.send_quote(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; r public.quote_requests%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if q.id is null or not private.staff_can_manage(q.organization_id) or q.status <> 'draft' then
    raise exception 'Quote not found.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.quote_tiers where quote_id = q.id) then raise exception 'Add at least one quantity and price.'; end if;
  select * into r from public.quote_requests where id = q.quote_request_id for update;
  if r.status not in ('submitted', 'quoted') then raise exception 'This request is already closed.'; end if;
  update public.quotes set status = 'superseded' where quote_request_id = q.quote_request_id and status = 'sent';
  update public.quotes set status = 'sent', sent_by = auth.uid(), sent_at = now() where id = q.id;
  update public.quote_requests set status = 'quoted' where id = r.id;
  perform private.notify_org_users(q.organization_id, array['client_admin']::public.client_role[], 'quote_ready',
    'Your quote is ready', r.title, '/app/quotes/' || r.id, r.submitted_by);
end $$;

-- ------------------------------------ 3. new order delivered -> Print Item
-- When a NEW order is delivered (or closed), each line without a Print Item
-- becomes one, with its specs and the price paid, so next time it is a reorder.
create or replace function private.create_print_items_from_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  oi record;
  v_item uuid;
  v_cat uuid;
begin
  if new.status not in ('delivered', 'closed') or old.status in ('delivered', 'closed') then return null; end if;
  for oi in select i.*, p.total_centavos, p.unit_price, p.vat_inclusive from public.order_items i
             left join public.order_item_prices p on p.order_item_id = i.id
            where i.order_id = new.id and i.print_item_id is null loop
    select category_id into v_cat from public.products where id = oi.product_id;
    insert into public.print_items (organization_id, name, category_id, product_id, spec, spec_signature, source_order_id)
    values (new.organization_id, oi.title, v_cat, oi.product_id, oi.spec_snapshot, null, new.id)
    returning id into v_item;
    insert into public.artwork_versions (organization_id, print_item_id, version_no, change_notes, status)
    values (new.organization_id, v_item, 1, format('From order %s — upload the final print file and approve it', new.order_no), 'draft');
    update public.order_items set print_item_id = v_item where id = oi.id;
    if oi.total_centavos is not null then
      insert into public.price_tiers (organization_id, print_item_id, quantity, unit_price, total_centavos, vat_inclusive, source, source_ref, base_date)
      values (new.organization_id, v_item, oi.quantity, oi.unit_price, oi.total_centavos, coalesce(oi.vat_inclusive, true), 'order', new.order_no,
              (coalesce(new.delivered_at, now()) at time zone 'Asia/Manila')::date);
    end if;
    perform private.notify_org_staff(new.organization_id, 'print_item_created', format('New Print Item from %s', new.order_no),
      format('%s — upload the final approved file', oi.title), '/staff/items/' || v_item);
  end loop;
  return null;
end $$;
create trigger trg_print_items_from_order after update of status on public.orders
  for each row execute function private.create_print_items_from_order();

revoke all on function public.submit_quote_request(uuid, text, jsonb, int[], uuid, date, text, text, uuid[], text[], boolean), public.place_standard_order(uuid, uuid, date, text, text, uuid[], text[], boolean),
  public.accept_quote(uuid, uuid, text, text), public.decline_quote(uuid, text), public.send_quote(uuid) from public, anon;
grant execute on function public.submit_quote_request(uuid, text, jsonb, int[], uuid, date, text, text, uuid[], text[], boolean), public.place_standard_order(uuid, uuid, date, text, text, uuid[], text[], boolean),
  public.accept_quote(uuid, uuid, text, text), public.decline_quote(uuid, text), public.send_quote(uuid) to authenticated;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

drop policy if exists quote_requests_insert on public.quote_requests;
create policy quote_requests_insert on public.quote_requests for insert to authenticated with check (private.staff_can_manage(organization_id));

-- Clients may no longer insert orders/items directly: orders come from the
-- functions above (prices are always set by the server).
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert to authenticated with check (private.staff_can_manage(organization_id));
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items for insert to authenticated with check (private.staff_can_manage(organization_id));

-- Clients upload artwork for new orders / quote requests to the attachments bucket.
drop policy if exists files_insert_client on public.files;
create policy files_insert_client on public.files for insert to authenticated
  with check (private.can_order(organization_id) and bucket = 'attachments' and uploaded_by = auth.uid()
              and purpose in ('revision_attachment','payment_slip','quote_request_artwork'));

select private.attach_updated_at_triggers();
