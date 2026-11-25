-- ============================================================================
-- 0009  Storage buckets and their access rules
-- ============================================================================
-- Object paths always start with the client company id:
--     <organization_id>/<print_item_id>/<version>/<file>
--
--   print-files  high-res print files            staff only (never clients)
--   previews     low-res watermarked JPGs        staff + that company (signed URLs)
--   attachments  client uploads, order photos    staff + that company
--                (payment slips under <org>/payment-slips/ need price access)
--   assets       fonts, catalog photos           any signed-in user; staff write
--   brand        logo / login-page images        public read; pa_admin write
--
-- File size limit: 50 MB per file while on the Supabase FREE plan (the
-- maximum it allows). On Pro, raise it to 100 MB:
--   update storage.buckets set file_size_limit = 104857600
--    where id in ('print-files','attachments');
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('print-files', 'print-files', false, 52428800),
  ('previews',    'previews',    false, 10485760),
  ('attachments', 'attachments', false, 52428800),
  ('assets',      'assets',      false, 20971520),
  ('brand',       'brand',       true,  5242880)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- print-files: staff only
create policy pf_select on storage.objects for select to authenticated
  using (bucket_id = 'print-files' and private.staff_can_view(private.path_org(name)));
create policy pf_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)));
create policy pf_update on storage.objects for update to authenticated
  using (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)))
  with check (bucket_id = 'print-files' and private.staff_can_manage(private.path_org(name)));
-- no delete policy: print files are never deleted through the API

-- previews: the company can read its own; staff write
create policy pv_select on storage.objects for select to authenticated
  using (bucket_id = 'previews' and private.can_read_org(private.path_org(name)));
create policy pv_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));
create policy pv_update on storage.objects for update to authenticated
  using (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)))
  with check (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));
create policy pv_delete on storage.objects for delete to authenticated
  using (bucket_id = 'previews' and private.staff_can_manage(private.path_org(name)));

-- attachments
create policy at_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_org(private.path_org(name))
         and ((storage.foldername(name))[2] is distinct from 'payment-slips'
              or private.can_see_prices(private.path_org(name))));
create policy at_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
       private.can_order(private.path_org(name))
    or private.staff_can_view(private.path_org(name))));

-- assets
create policy as_select on storage.objects for select to authenticated
  using (bucket_id = 'assets' and private.is_active_user());
create policy as_write on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and private.is_price_staff());
create policy as_update on storage.objects for update to authenticated
  using (bucket_id = 'assets' and private.is_price_staff())
  with check (bucket_id = 'assets' and private.is_price_staff());

-- brand (public bucket: reads are served without a policy)
create policy br_write on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and private.is_pa_admin());
create policy br_update on storage.objects for update to authenticated
  using (bucket_id = 'brand' and private.is_pa_admin())
  with check (bucket_id = 'brand' and private.is_pa_admin());
