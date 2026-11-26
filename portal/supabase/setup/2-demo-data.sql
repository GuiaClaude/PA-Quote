-- DEMO DATA ONLY. Never run this on the live project.
-- Creates the demo companies, users (password Demo-Print-2026!), items, orders and prices.
-- ============================================================================
-- DEMO SEED DATA — for local development and the demo project only.
-- Never run against the live production project.
--
-- Every demo account uses the password:  Demo-Print-2026!
-- Email addresses use the reserved ".test" domain so no real email is sent.
-- ============================================================================

-- Fixed ids: users 10000000-…, companies 20000000-…-00a (ABC) / -00b (Sunrise)

-- ------------------------------------------------------------ demo logins
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       extensions.crypt('Demo-Print-2026!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('10000000-0000-4000-8000-000000000001',    'admin@pa-demo.test',        'Maria Santos'),
  ('10000000-0000-4000-8000-000000000002',   'sales1@pa-demo.test',       'Paolo Reyes'),
  ('10000000-0000-4000-8000-000000000003',   'sales2@pa-demo.test',       'Andrea Cruz'),
  ('10000000-0000-4000-8000-000000000004',     'production@pa-demo.test',   'Jun Villanueva'),
  ('10000000-0000-4000-8000-0000000000a1',  'admin@abccorp-demo.test',   'Liza Mendoza'),
  ('10000000-0000-4000-8000-0000000000a2',  'buyer@abccorp-demo.test',   'Ramon Garcia'),
  ('10000000-0000-4000-8000-0000000000a3', 'marketing@abccorp-demo.test','Bea Torres'),
  ('10000000-0000-4000-8000-0000000000b1',  'admin@sunrisefoods-demo.test','Carlo Tan'),
  ('10000000-0000-4000-8000-0000000000b2',  'purchasing@sunrisefoods-demo.test','Grace Lim'),
  ('10000000-0000-4000-8000-0000000000b3', 'brand@sunrisefoods-demo.test','Nico Ramos')
) as u(id, email, full_name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.email like '%-demo.test';

-- profiles were created by the trigger; add names, roles and contact details
update public.profiles p set
  full_name = d.full_name, staff_role = d.staff_role::public.staff_role, phone = d.phone, viber = d.viber,
  job_title = d.job_title, last_login_at = now() - (d.days_ago || ' days')::interval
from (values
  ('10000000-0000-4000-8000-000000000001',    'Maria Santos',  'pa_admin',      '0917 100 0001', '0917 100 0001', 'General Manager', 1),
  ('10000000-0000-4000-8000-000000000002',   'Paolo Reyes',   'pa_sales',      '0917 100 0002', '0917 100 0002', 'Account Manager', 0),
  ('10000000-0000-4000-8000-000000000003',   'Andrea Cruz',   'pa_sales',      '0917 100 0003', '0917 100 0003', 'Account Manager', 2),
  ('10000000-0000-4000-8000-000000000004',     'Jun Villanueva','pa_production', '0917 100 0004', null,            'Production Head', 0),
  ('10000000-0000-4000-8000-0000000000a1',  'Liza Mendoza',  null, '0918 200 0001', null, 'Purchasing Manager', 3),
  ('10000000-0000-4000-8000-0000000000a2',  'Ramon Garcia',  null, '0918 200 0002', null, 'Purchasing Officer', 5),
  ('10000000-0000-4000-8000-0000000000a3', 'Bea Torres',    null, '0918 200 0003', null, 'Marketing Associate', 40),
  ('10000000-0000-4000-8000-0000000000b1',  'Carlo Tan',     null, '0919 300 0001', null, 'Operations Director', 7),
  ('10000000-0000-4000-8000-0000000000b2',  'Grace Lim',     null, '0919 300 0002', null, 'Purchasing Officer', 1),
  ('10000000-0000-4000-8000-0000000000b3', 'Nico Ramos',    null, '0919 300 0003', null, 'Brand Manager', 90)
) as d(id, full_name, staff_role, phone, viber, job_title, days_ago)
where p.id = d.id::uuid;

-- --------------------------------------------------------------- settings
insert into public.settings (key, value, visibility, description) values
('company', '{
   "name": "Print Amplified",
   "legal_name": "Print Amplified (PLACEHOLDER — replace in Settings)",
   "address": "Metro Manila, Philippines",
   "phone": "+63 2 0000 0000",
   "email": "hello@printamplified.com",
   "website": "https://www.printamplified.com"
 }', 'public', 'Company details shown in the app, emails and quotes'),
('branding', '{"primary": "#00AEBF", "accent": "#E0295A", "logo_path": null}', 'public', 'Logo and brand colours'),
('payment_instructions', '{
   "bank_accounts": [
     {"bank": "BDO Unibank", "account_name": "PRINT AMPLIFIED (PLACEHOLDER)", "account_no": "0000 0000 0000", "branch": "PLACEHOLDER"},
     {"bank": "BPI", "account_name": "PRINT AMPLIFIED (PLACEHOLDER)", "account_no": "0000 0000 00", "branch": "PLACEHOLDER"}
   ],
   "cheque_payee": "PRINT AMPLIFIED (PLACEHOLDER)",
   "notes": "Please send your deposit slip or cheque photo through the order page, or email it to your account manager."
 }', 'client', 'Bank details and cheque payee shown on every order'),
('email', '{"from_name": "Print Amplified", "from_email": "orders@order.printamplified.com", "reply_to": "hello@printamplified.com"}', 'staff', 'Sender details for notification emails'),
('security', '{
   "require_mfa": false,
   "web_session_hours": 12,
   "app_session_days": 30,
   "lockout_max_attempts": 5,
   "lockout_minutes": 15
 }', 'staff', 'Login security. DEMO: 2-step verification is OFF — turn it ON before go-live.'),
('uploads', '{"max_file_mb": 50}', 'client', 'Maximum upload size (50 MB on Supabase Free; 100 MB on Pro)'),
('features', '{"ai_autofill_enabled": false}', 'staff', 'Optional paid features')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- Pricing rules v1 and the inflation table come from migration 0010.

-- ----------------------------------------------------------- client companies
insert into public.organizations (id, name, slug, billing_name, tin, credit_terms, notes, client_adjustment_pct, created_by) values
  ('20000000-0000-4000-8000-00000000000a', 'ABC Corporation', 'abc-corporation', 'ABC Corporation', '000-111-222-000', '30 days upon delivery', 'Demo client A', 0, '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000b', 'Sunrise Foods Inc.', 'sunrise-foods', 'Sunrise Foods Incorporated', '000-333-444-000', 'COD / post-dated cheque', 'Demo client B — 3% loyalty discount', -3, '10000000-0000-4000-8000-000000000001');

insert into public.organization_domains (organization_id, domain) values
  ('20000000-0000-4000-8000-00000000000a', 'abccorp-demo.test'),
  ('20000000-0000-4000-8000-00000000000b', 'sunrisefoods-demo.test');

insert into public.memberships (profile_id, organization_id, client_role) values
  ('10000000-0000-4000-8000-0000000000a1',  '20000000-0000-4000-8000-00000000000a', 'client_admin'),
  ('10000000-0000-4000-8000-0000000000a2',  '20000000-0000-4000-8000-00000000000a', 'client_buyer'),
  ('10000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', 'client_viewer'),
  ('10000000-0000-4000-8000-0000000000b1',  '20000000-0000-4000-8000-00000000000b', 'client_admin'),
  ('10000000-0000-4000-8000-0000000000b2',  '20000000-0000-4000-8000-00000000000b', 'client_buyer'),
  ('10000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 'client_viewer');

insert into public.staff_assignments (organization_id, staff_profile_id, is_primary) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', true),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000003', true);

insert into public.addresses (id, organization_id, label, recipient, phone, line1, barangay, city, province, zip, is_default) values
  ('30000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 'Head office', 'Liza Mendoza', '0918 200 0001', '12F ABC Tower, Ayala Avenue', 'San Lorenzo', 'Makati City', 'Metro Manila', '1223', true),
  ('30000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 'Warehouse – Laguna', 'Receiving Dept.', '0918 200 0009', 'Lot 4 Phase 2, Light Industry Park', 'Pulo', 'Cabuyao', 'Laguna', '4025', false),
  ('30000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 'Plant – Valenzuela', 'Warehouse Supervisor', '0919 300 0009', '88 MacArthur Highway', 'Malinta', 'Valenzuela City', 'Metro Manila', '1440', true);

-- -------------------------------------------------------------- catalog
insert into public.product_categories (id, name, slug, description, sort) values
  ('40000000-0000-4000-8000-000000000001', 'Marketing Collateral', 'marketing-collateral', 'Flyers, brochures, posters and tarpaulins', 1),
  ('40000000-0000-4000-8000-000000000002', 'Stationery', 'stationery', 'Business cards, letterheads and envelopes', 2),
  ('40000000-0000-4000-8000-000000000003', 'Labels & Stickers', 'labels-stickers', 'Product labels, price tags and stickers', 3),
  ('40000000-0000-4000-8000-000000000004', 'Packaging', 'packaging', 'Boxes, cartons and sleeves', 4);

insert into public.products (id, category_id, name, slug, description, default_lead_time_text, visibility, sort) values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Flyers', 'flyers', 'Single sheet flyers, one or two sides', '3–5 working days', 'all', 1),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Brochures', 'brochures', 'Bi-fold and tri-fold brochures', '5–7 working days', 'all', 2),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 'Tarpaulins', 'tarpaulins', 'Indoor / outdoor tarpaulin with eyelets', '2–3 working days', 'all', 3),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 'Roll-up Standees', 'standees', 'Roll-up standee with stand and bag', '3–5 working days', 'all', 4),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'Business Cards', 'business-cards', 'Standard 2" x 3.5" business cards', '3–5 working days', 'all', 1),
  ('41000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'Letterheads', 'letterheads', 'A4 letterheads on bond paper', '5–7 working days', 'all', 2),
  ('41000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002', 'Envelopes', 'envelopes', 'Long and window envelopes', '7–10 working days', 'all', 3),
  ('41000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000003', 'Product Labels', 'product-labels', 'Roll or sheet labels, matte or gloss', '5–7 working days', 'all', 1),
  ('41000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000004', 'Folding Boxes', 'folding-boxes', 'Printed paperboard folding cartons', '10–15 working days', 'all', 1),
  ('41000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000004', 'Corrugated Shipping Boxes', 'shipping-boxes', 'Printed corrugated cartons — custom for Sunrise Foods', '12–15 working days', 'selected', 2);

-- only Sunrise Foods sees the custom corrugated boxes
insert into public.product_visibility (product_id, organization_id) values
  ('41000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-00000000000b');

insert into public.product_options (product_id, kind, label, value, sort) values
  ('41000000-0000-4000-8000-000000000001', 'size', 'A5 (148 x 210 mm)', '{"size":"A5"}', 1),
  ('41000000-0000-4000-8000-000000000001', 'size', 'A4 (210 x 297 mm)', '{"size":"A4"}', 2),
  ('41000000-0000-4000-8000-000000000001', 'material', 'Gloss Art Paper 120gsm', '{"material":"Gloss Art","gsm":120}', 1),
  ('41000000-0000-4000-8000-000000000001', 'material', 'Matte Art Paper 150gsm', '{"material":"Matte Art","gsm":150}', 2),
  ('41000000-0000-4000-8000-000000000001', 'colors', '4/0 — full colour front', '{"colors":"4/0"}', 1),
  ('41000000-0000-4000-8000-000000000001', 'colors', '4/4 — full colour both sides', '{"colors":"4/4"}', 2),
  ('41000000-0000-4000-8000-000000000001', 'quantity', '500 / 1,000 / 2,000', '{"quantities":[500,1000,2000]}', 1),
  ('41000000-0000-4000-8000-000000000005', 'size', '2" x 3.5"', '{"size":"2x3.5in"}', 1),
  ('41000000-0000-4000-8000-000000000005', 'material', 'C2S 300gsm (Carolina)', '{"material":"Carolina C2S","gsm":300}', 1),
  ('41000000-0000-4000-8000-000000000005', 'colors', '4/4 — full colour both sides', '{"colors":"4/4"}', 1),
  ('41000000-0000-4000-8000-000000000005', 'finishing', 'Matte lamination both sides', '{"finishing":["matte lamination 2 sides"]}', 1),
  ('41000000-0000-4000-8000-000000000005', 'quantity', '100 / 200 / 500 / 1,000', '{"quantities":[100,200,500,1000]}', 1),
  ('41000000-0000-4000-8000-000000000008', 'finishing', 'Gloss lamination', '{"finishing":["gloss lamination"]}', 1),
  ('41000000-0000-4000-8000-000000000008', 'finishing', 'Kiss-cut on roll', '{"finishing":["kiss-cut","roll"]}', 2),
  ('41000000-0000-4000-8000-000000000009', 'material', 'SBS Board 300gsm', '{"material":"SBS Board","gsm":300}', 1),
  ('41000000-0000-4000-8000-000000000009', 'finishing', 'Spot UV + die-cut', '{"finishing":["spot UV","die-cut"]}', 1);

-- standard price list (orderable straight away). spec_signature here is a
-- placeholder; the app recalculates signatures with its canonical function.
insert into public.standard_prices (product_id, spec, spec_signature, quantity, unit_price, total_centavos, vat_inclusive) values
  ('41000000-0000-4000-8000-000000000005', '{"size":"2x3.5in","material":"Carolina C2S","gsm":300,"colors":"4/4","finishing":["matte lamination 2 sides"]}', 'std-bc-1', 100, 6.5000, 65000, true),
  ('41000000-0000-4000-8000-000000000005', '{"size":"2x3.5in","material":"Carolina C2S","gsm":300,"colors":"4/4","finishing":["matte lamination 2 sides"]}', 'std-bc-1', 200, 4.2500, 85000, true),
  ('41000000-0000-4000-8000-000000000005', '{"size":"2x3.5in","material":"Carolina C2S","gsm":300,"colors":"4/4","finishing":["matte lamination 2 sides"]}', 'std-bc-1', 500, 2.6000, 130000, true),
  ('41000000-0000-4000-8000-000000000001', '{"size":"A5","material":"Gloss Art","gsm":120,"colors":"4/0"}', 'std-fl-1', 500, 4.2000, 210000, true),
  ('41000000-0000-4000-8000-000000000001', '{"size":"A5","material":"Gloss Art","gsm":120,"colors":"4/0"}', 'std-fl-1', 1000, 2.9000, 290000, true),
  ('41000000-0000-4000-8000-000000000001', '{"size":"A5","material":"Gloss Art","gsm":120,"colors":"4/0"}', 'std-fl-1', 2000, 2.1000, 420000, true);

insert into public.category_surcharges (category_id, label, pct, effective_from, set_by) values
  ('40000000-0000-4000-8000-000000000004', 'Paperboard price increase', 5.000, '2025-07-01', '10000000-0000-4000-8000-000000000001');
insert into public.fixed_addons (scope, label, amount_centavos, effective_from, set_by) values
  ('order', 'Delivery within Metro Manila', 0, '2025-01-01', '10000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------- Print Items
-- A1..A4 belong to ABC Corporation, B1..B4 to Sunrise Foods.
insert into public.print_items (id, organization_id, code, name, category_id, product_id, tags, spec, spec_signature, created_by) values
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 'ABC-BR-01', 'Product Brochure A4 Trifold', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', '{brochure,sales}',
   '{"size":"A4 open, folds to DL","material":"Gloss Art","gsm":150,"colors":"4/4","finishing":["tri-fold"],"packaging":"bundles of 100"}', 'sig-a1', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 'ABC-BC-LM', 'Business Card – Liza Mendoza', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005', '{business card}',
   '{"size":"2x3.5in","material":"Carolina C2S","gsm":300,"colors":"4/4","finishing":["matte lamination 2 sides"],"packaging":"box of 100"}', 'sig-a2', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', 'ABC-LH-01', 'Letterhead A4', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000006', '{stationery}',
   '{"size":"A4","material":"Bond","gsm":80,"colors":"4/0","finishing":[],"packaging":"reams of 500"}', 'sig-a3', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-00000000000a', 'ABC-BX-M', 'Shipping Box Medium', '40000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000009', '{packaging,box}',
   '{"size":"12 x 10 x 8 in","material":"SBS Board","gsm":300,"colors":"4/0 + PMS 286C","finishing":["spot UV","die-cut"],"packaging":"flat-packed, 50 per bundle"}', 'sig-a4', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 'SF-LBL-80', 'Sunrise Mango Jam Label 80x50', '40000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000008', '{label,jam}',
   '{"size":"80 x 50 mm","material":"Gloss Sticker","gsm":null,"colors":"4/0","finishing":["gloss lamination","kiss-cut","roll"],"packaging":"rolls of 1,000"}', 'sig-b1', '10000000-0000-4000-8000-000000000003'),
  ('50000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 'SF-PT-01', 'Shelf Price Tag', '40000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000008', '{price tag}',
   '{"size":"60 x 30 mm","material":"Matte Sticker","gsm":null,"colors":"4/0","finishing":["kiss-cut"],"packaging":"sheets"}', 'sig-b2', '10000000-0000-4000-8000-000000000003'),
  ('50000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 'SF-FL-A5', 'Promo Flyer A5', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', '{flyer,promo}',
   '{"size":"A5","material":"Gloss Art","gsm":120,"colors":"4/4","finishing":[],"packaging":"bundles of 250"}', 'sig-b3', '10000000-0000-4000-8000-000000000003'),
  ('50000000-0000-4000-8000-0000000000b4', '20000000-0000-4000-8000-00000000000b', 'SF-CTN-L', 'Corrugated Carton Large', '40000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000010', '{packaging,carton}',
   '{"size":"18 x 12 x 10 in","material":"B-flute corrugated","gsm":null,"colors":"2/0 (PMS 165C, Black)","finishing":["die-cut"],"packaging":"flat, 25 per bundle"}', 'sig-b4', '10000000-0000-4000-8000-000000000003');

-- artwork versions (v1 approved for most; brochure has v1 superseded + v2 approved)
insert into public.artwork_versions (id, organization_id, print_item_id, version_no, change_notes, status, uploaded_by, approved_by, approved_at, created_at) values
  ('51000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a1', 1, 'Original 2023 design', 'draft', '10000000-0000-4000-8000-000000000002', null, null, '2023-03-10'),
  ('51000000-0000-4000-8000-0000000000a5', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a1', 2, 'Updated product photos and new hotline', 'draft', '10000000-0000-4000-8000-000000000002', null, null, '2025-02-14'),
  ('51000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a2', 1, 'Initial card', 'draft', '10000000-0000-4000-8000-000000000002', null, null, '2025-06-01'),
  ('51000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a3', 1, 'Letterhead from client files', 'draft', '10000000-0000-4000-8000-000000000002', null, null, '2022-05-20'),
  ('51000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a4', 1, 'Box dieline v1', 'draft', '10000000-0000-4000-8000-000000000002', null, null, '2024-09-02'),
  ('51000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b1', 1, 'Mango jam label', 'draft', '10000000-0000-4000-8000-000000000003', null, null, '2024-11-11'),
  ('51000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b2', 1, 'Price tag template', 'draft', '10000000-0000-4000-8000-000000000003', null, null, '2025-01-08'),
  ('51000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b3', 1, 'Holiday promo', 'draft', '10000000-0000-4000-8000-000000000003', null, null, '2025-10-01'),
  ('51000000-0000-4000-8000-0000000000b4', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b4', 1, 'Carton print', 'draft', '10000000-0000-4000-8000-000000000003', null, null, '2021-08-15');

-- files: some uploaded (objects are added by the Phase 2 file seeder), some Drive-link only
insert into public.files (id, organization_id, artwork_version_id, purpose, kind, bucket, storage_path, external_url, label, original_name, mime_type, size_bytes, uploaded_by) values
  ('52000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a1', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000a/brochure/v1/brochure-2023.pdf', null, 'Print-ready PDF', 'ABC_Brochure_2023_FINAL.pdf', 'application/pdf', 8400000, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000a5', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a5', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000a/brochure/v2/brochure-2025.pdf', null, 'Print-ready PDF', 'ABC_Brochure_2025_v2_FINAL.pdf', 'application/pdf', 9100000, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000a6', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a5', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000a/brochure/v2/brochure-2025-package.zip', null, 'Open files package (AI + links + fonts)', 'ABC_Brochure_2025_package.zip', 'application/zip', 18500000, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a2', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000a/bizcard-lm/v1/card.pdf', null, 'Card front + back', 'BC_Liza_Mendoza.pdf', 'application/pdf', 1200000, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a3', 'artwork', 'drive_link', null, null, 'https://drive.google.com/file/d/DEMO-letterhead/view', 'Client Google Drive (letterhead)', null, null, null, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000a4', 'artwork', 'drive_link', null, null, 'https://drive.google.com/drive/folders/DEMO-box-dieline', 'Agency Drive folder (box dieline)', null, null, null, '10000000-0000-4000-8000-000000000002'),
  ('52000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '51000000-0000-4000-8000-0000000000b1', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000b/label-80x50/v1/label.pdf', null, 'Label artwork', 'Mango_Jam_Label_80x50.pdf', 'application/pdf', 3400000, '10000000-0000-4000-8000-000000000003'),
  ('52000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '51000000-0000-4000-8000-0000000000b2', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000b/price-tag/v1/price-tag.pdf', null, 'Price tag template', 'Shelf_Price_Tag.pdf', 'application/pdf', 900000, '10000000-0000-4000-8000-000000000003'),
  ('52000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', '51000000-0000-4000-8000-0000000000b3', 'artwork', 'drive_link', null, null, 'https://drive.google.com/file/d/DEMO-promo-flyer/view', 'Brand team Drive (promo flyer)', null, null, null, '10000000-0000-4000-8000-000000000003'),
  ('52000000-0000-4000-8000-0000000000b4', '20000000-0000-4000-8000-00000000000b', '51000000-0000-4000-8000-0000000000b4', 'artwork', 'upload', 'print-files', '20000000-0000-4000-8000-00000000000b/carton-l/v1/carton.pdf', null, 'Carton print file', 'Carton_Large_2021.pdf', 'application/pdf', 5600000, '10000000-0000-4000-8000-000000000003');

-- approve: v1 of the brochure first (then superseded by v2), and v1 of the others
update public.artwork_versions set status = 'approved', approved_by = '10000000-0000-4000-8000-0000000000a1', approved_at = '2023-03-15'
 where id = '51000000-0000-4000-8000-0000000000a1';
update public.artwork_versions set status = 'superseded'
 where id = '51000000-0000-4000-8000-0000000000a1';
update public.artwork_versions set status = 'approved', approved_by = '10000000-0000-4000-8000-0000000000a1', approved_at = created_at + interval '3 days'
 where id in ('51000000-0000-4000-8000-0000000000a5','51000000-0000-4000-8000-0000000000a2',
              '51000000-0000-4000-8000-0000000000a3','51000000-0000-4000-8000-0000000000a4');
update public.artwork_versions set status = 'approved', approved_by = '10000000-0000-4000-8000-0000000000b1', approved_at = created_at + interval '3 days'
 where organization_id = '20000000-0000-4000-8000-00000000000b';

update public.print_items p set approved_version_id = v.id
  from public.artwork_versions v where v.print_item_id = p.id and v.status = 'approved';

-- preview rows (images are generated by the Phase 2 file seeder)
insert into public.preview_renditions (id, organization_id, file_id, page_no, side, preview_path, status) values
  ('53000000-0000-4000-8000-0000000000a5', '20000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-0000000000a5', 1, 'front', '20000000-0000-4000-8000-00000000000a/brochure/v2/p1.jpg', 'pending'),
  ('53000000-0000-4000-8000-0000000000a6', '20000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-0000000000a5', 2, 'back',  '20000000-0000-4000-8000-00000000000a/brochure/v2/p2.jpg', 'pending'),
  ('53000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-0000000000a2', 1, 'front', '20000000-0000-4000-8000-00000000000a/bizcard-lm/v1/p1.jpg', 'pending'),
  ('53000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '52000000-0000-4000-8000-0000000000b1', 1, 'front', '20000000-0000-4000-8000-00000000000b/label-80x50/v1/p1.jpg', 'pending'),
  ('53000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '52000000-0000-4000-8000-0000000000b2', 1, 'front', '20000000-0000-4000-8000-00000000000b/price-tag/v1/p1.jpg', 'pending');

-- colour standards
insert into public.color_standards (id, organization_id, print_item_id, pantone_refs, cmyk_targets, paper_stock, press_machine, notes, approved_by_name, approved_by, approved_at) values
  ('54000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a1', '{"PMS 286 C"}', '{"ABC Blue":{"c":100,"m":72,"y":0,"k":6}}', 'Gloss Art 150gsm', 'Komori (26"x19")', 'Match the blue on the 2025 press sheet. Skin tones on page 2 must not go red.', 'Liza Mendoza', '10000000-0000-4000-8000-0000000000a1', '2025-02-17'),
  ('54000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a4', '{"PMS 286 C"}', '{}', 'SBS Board 300gsm', 'Sord (25"x35")', 'Spot UV on logo only.', 'Liza Mendoza', '10000000-0000-4000-8000-0000000000a1', '2024-09-06'),
  ('54000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b1', '{"PMS 165 C","PMS 7408 C"}', '{"Mango Orange":{"c":0,"m":60,"y":100,"k":0}}', 'Gloss sticker', 'Eneo (40"x13")', 'Orange must match the approved roll sample kept at the Sunrise QA office.', 'Carlo Tan', '10000000-0000-4000-8000-0000000000b1', '2024-11-15');
update public.print_items set color_standard_id = '54000000-0000-4000-8000-0000000000a1' where id = '50000000-0000-4000-8000-0000000000a1';
update public.print_items set color_standard_id = '54000000-0000-4000-8000-0000000000a4' where id = '50000000-0000-4000-8000-0000000000a4';
update public.print_items set color_standard_id = '54000000-0000-4000-8000-0000000000b1' where id = '50000000-0000-4000-8000-0000000000b1';

-- editable templates: business card (A2) and price tag (B2)
insert into public.editable_templates (id, organization_id, print_item_id, artwork_version_id, rendition_id) values
  ('55000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a2', '51000000-0000-4000-8000-0000000000a2', '53000000-0000-4000-8000-0000000000a2'),
  ('55000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b2', '51000000-0000-4000-8000-0000000000b2', '53000000-0000-4000-8000-0000000000b2');
-- Field boxes line up with the demo artwork made by `npm run seed:files`
-- (business card 89 x 51 mm, price tag 60 x 30 mm).
insert into public.template_fields (organization_id, template_id, key, label, default_text, x_pct, y_pct, w_pct, h_pct, font_size_pt, font_weight, color_hex, align, max_chars, sort) values
  ('20000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-0000000000a2', 'name',     'Name',     'Liza Mendoza',                     6.0, 40.5, 70, 11, 11, 700, '#1B2A4A', 'left', 30, 1),
  ('20000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-0000000000a2', 'position', 'Position', 'Purchasing Manager',               6.0, 53.5, 70,  7,  7, 400, '#4A5568', 'left', 40, 2),
  ('20000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-0000000000a2', 'phone',    'Mobile',   '0918 200 0001',                    6.0, 69.0, 60,  7,  7, 400, '#1B2A4A', 'left', 20, 3),
  ('20000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-0000000000a2', 'email',    'Email',    'liza.mendoza@abccorp-demo.test',   6.0, 77.0, 75,  7,  7, 400, '#1B2A4A', 'left', 40, 4),
  ('20000000-0000-4000-8000-00000000000b', '55000000-0000-4000-8000-0000000000b2', 'product',  'Product',  'Mango Jam 250g',                   4.0, 15.5, 92, 13,  9, 700, '#1B2A4A', 'center', 24, 1),
  ('20000000-0000-4000-8000-00000000000b', '55000000-0000-4000-8000-0000000000b2', 'price',    'Price',    'PHP 129.00',                       4.0, 44.0, 92, 24, 16, 700, '#E0295A', 'center', 12, 2),
  ('20000000-0000-4000-8000-00000000000b', '55000000-0000-4000-8000-0000000000b2', 'sku',      'SKU',      'SKU 4800001',                      4.0, 76.0, 92,  8,  5, 400, '#4A5568', 'center', 16, 3);

-- open revision request with markups on the brochure (ABC)
insert into public.revision_requests (id, organization_id, print_item_id, base_version_id, round_no, status, general_notes, submitted_by, submitted_at) values
  ('56000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-0000000000a5', 1, 'open',
   'Please update for the 2026 run. New logo file attached.', '10000000-0000-4000-8000-0000000000a2', now() - interval '1 day');
insert into public.revision_markups (organization_id, revision_request_id, rendition_id, page_no, shape, x_pct, y_pct, w_pct, h_pct, comment, created_by, sort) values
  ('20000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-0000000000a5', 1, 'pin', 72.5, 88.0, null, null, 'Change hotline to 0917 123 4567', '10000000-0000-4000-8000-0000000000a2', 1),
  ('20000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-0000000000a5', 1, 'box', 8.0, 6.0, 22.0, 10.0, 'Replace logo with the attached 2026 logo', '10000000-0000-4000-8000-0000000000a2', 2),
  ('20000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-0000000000a1', '53000000-0000-4000-8000-0000000000a6', 2, 'box', 50.0, 40.0, 40.0, 30.0, 'Remove the discontinued product (Model X200)', '10000000-0000-4000-8000-0000000000a2', 3);

-- --------------------------------------------------------- past estimates
insert into public.past_estimates (id, organization_id, print_item_id, estimate_no, estimate_date, vat_inclusive, notes, status, extracted_by, confirmed_by, confirmed_at, created_by) values
  ('57000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a1', 'CE-2025-0142', '2025-02-10', true,  'Brochure 2025 run', 'confirmed', 'staff', '10000000-0000-4000-8000-000000000002', '2025-02-11', '10000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a2', 'CE-2025-0301', '2025-06-01', true,  'Business cards', 'confirmed', 'staff', '10000000-0000-4000-8000-000000000002', '2025-06-01', '10000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a3', 'CE-2022-0088', '2022-05-18', true,  'Letterhead — older than 3 years, needs a fresh quote', 'confirmed', 'staff', '10000000-0000-4000-8000-000000000002', '2022-05-18', '10000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-0000000000a4', '20000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-0000000000a4', 'CE-2024-0410', '2024-09-01', false, 'Boxes — quoted VAT-exclusive', 'confirmed', 'staff', '10000000-0000-4000-8000-000000000002', '2024-09-02', '10000000-0000-4000-8000-000000000002'),
  ('57000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b1', 'CE-2024-0522', '2024-11-08', true,  'Jam labels', 'confirmed', 'staff', '10000000-0000-4000-8000-000000000003', '2024-11-09', '10000000-0000-4000-8000-000000000003'),
  ('57000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-0000000000b3', 'CE-2025-0610', '2025-09-25', true,  'Promo flyer — draft, waiting for staff to confirm', 'draft', 'staff', null, null, '10000000-0000-4000-8000-000000000003');

insert into public.past_estimate_lines (organization_id, past_estimate_id, description, spec, spec_signature, quantity, unit_price, total_centavos) values
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a1', 'Brochure A4 trifold', '{}', 'sig-a1', 1000, 18.5000, 1850000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a1', 'Brochure A4 trifold', '{}', 'sig-a1', 2000, 12.7500, 2550000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a1', 'Brochure A4 trifold', '{}', 'sig-a1', 5000,  8.9000, 4450000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a2', 'Business card', '{}', 'sig-a2', 200, 4.2500, 85000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a2', 'Business card', '{}', 'sig-a2', 500, 2.6000, 130000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a3', 'Letterhead', '{}', 'sig-a3', 1000, 3.2000, 320000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a3', 'Letterhead', '{}', 'sig-a3', 2500, 2.1000, 525000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a4', 'Shipping box medium', '{}', 'sig-a4', 1000, 38.0000, 3800000),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a4', 'Shipping box medium', '{}', 'sig-a4', 3000, 29.5000, 8850000),
  ('20000000-0000-4000-8000-00000000000b', '57000000-0000-4000-8000-0000000000b1', 'Jam label 80x50', '{}', 'sig-b1', 10000, 0.9500, 950000),
  ('20000000-0000-4000-8000-00000000000b', '57000000-0000-4000-8000-0000000000b1', 'Jam label 80x50', '{}', 'sig-b1', 25000, 0.7200, 1800000),
  ('20000000-0000-4000-8000-00000000000b', '57000000-0000-4000-8000-0000000000b3', 'Promo flyer A5', '{}', 'sig-b3', 2000, 2.4000, 480000);

insert into public.past_estimate_charges (organization_id, past_estimate_id, label, amount_centavos, recharge_on_reorder) values
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a4', 'Cutting die', 850000, false),
  ('20000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-0000000000a4', 'Plates (5 colours)', 600000, true),
  ('20000000-0000-4000-8000-00000000000b', '57000000-0000-4000-8000-0000000000b1', 'Label die', 350000, false);

-- agreed prices (copied from confirmed estimates)
insert into public.price_tiers (organization_id, print_item_id, quantity, unit_price, total_centavos, vat_inclusive, source, source_ref, base_date, created_by)
select l.organization_id, e.print_item_id, l.quantity, l.unit_price, l.total_centavos, e.vat_inclusive, 'estimate', e.estimate_no, e.estimate_date, e.created_by
  from public.past_estimate_lines l join public.past_estimates e on e.id = l.past_estimate_id
 where e.status = 'confirmed';

-- ---------------------------------------------------- quote requests & quotes
insert into public.quote_requests (id, organization_id, request_no, kind, product_id, print_item_id, title, spec, quantities, needs_design_help, requested_delivery_date, delivery_address_id, status, needs_quote_reasons, submitted_by, submitted_at, reply_due_at) values
  ('60000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 'QR-2026-0001', 'new', '41000000-0000-4000-8000-000000000003', null, 'Tarpaulin for store opening',
   '{"size":"6 x 10 ft","material":"Tarpaulin 13oz","colors":"4/0","finishing":["eyelets"]}', '{2,5}', true, current_date + 14, '30000000-0000-4000-8000-0000000000a1',
   'submitted', '{}', '10000000-0000-4000-8000-0000000000a2', now() - interval '30 hours', now() - interval '6 hours'),
  ('60000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 'QR-2026-0002', 'reorder', null, '50000000-0000-4000-8000-0000000000a3', 'Letterhead A4 — reorder',
   '{"size":"A4","material":"Bond","gsm":80,"colors":"4/0"}', '{2500}', false, current_date + 10, '30000000-0000-4000-8000-0000000000a1',
   'submitted', '{estimate_too_old}', '10000000-0000-4000-8000-0000000000a1', now() - interval '3 hours', now() + interval '21 hours'),
  ('60000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 'QR-2026-0003', 'new', '41000000-0000-4000-8000-000000000004', null, 'Roll-up standees for trade fair',
   '{"size":"2 x 5 ft","material":"Synthetic paper","colors":"4/0"}', '{3,6}', false, current_date + 7, '30000000-0000-4000-8000-0000000000b1',
   'quoted', '{}', '10000000-0000-4000-8000-0000000000b2', now() - interval '4 days', now() - interval '3 days'),
  ('60000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 'QR-2026-0004', 'reorder', null, '50000000-0000-4000-8000-0000000000b1', 'Jam labels — 15,000 pcs',
   '{"size":"80 x 50 mm","material":"Gloss Sticker","colors":"4/0"}', '{15000}', false, current_date + 20, '30000000-0000-4000-8000-0000000000b1',
   'accepted', '{quantity_not_in_tiers}', '10000000-0000-4000-8000-0000000000b2', now() - interval '20 days', now() - interval '19 days'),
  ('60000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 'QR-2026-0005', 'new', '41000000-0000-4000-8000-000000000007', null, 'Window envelopes',
   '{"size":"Long, with window","material":"Bond","gsm":100,"colors":"1/0"}', '{5000}', false, null, null,
   'declined', '{}', '10000000-0000-4000-8000-0000000000b1', now() - interval '40 days', now() - interval '39 days');

insert into public.quotes (id, organization_id, quote_request_id, quote_no, revision_no, lead_time_text, valid_until, vat_inclusive, notes, status, sent_by, sent_at, responded_by, responded_at, decline_reason) values
  ('61000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '60000000-0000-4000-8000-0000000000b1', 'Q-2026-0001', 1, '3–5 working days', current_date + 11, true, 'Includes stand and carry bag.', 'sent', '10000000-0000-4000-8000-000000000003', now() - interval '3 days', null, null, null),
  ('61000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '60000000-0000-4000-8000-0000000000b2', 'Q-2026-0002', 1, '5–7 working days', current_date - 5, true, 'Same specs as last run.', 'accepted', '10000000-0000-4000-8000-000000000003', now() - interval '19 days', '10000000-0000-4000-8000-0000000000b2', now() - interval '18 days', null),
  ('61000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', '60000000-0000-4000-8000-0000000000b3', 'Q-2026-0003', 1, '7–10 working days', current_date - 25, true, null, 'declined', '10000000-0000-4000-8000-000000000003', now() - interval '39 days', '10000000-0000-4000-8000-0000000000b1', now() - interval '38 days', 'Found stock in our warehouse');

insert into public.quote_tiers (organization_id, quote_id, quantity, unit_price, total_centavos, is_selected) values
  ('20000000-0000-4000-8000-00000000000b', '61000000-0000-4000-8000-0000000000b1', 3, 2950.0000, 885000, false),
  ('20000000-0000-4000-8000-00000000000b', '61000000-0000-4000-8000-0000000000b1', 6, 2750.0000, 1650000, false),
  ('20000000-0000-4000-8000-00000000000b', '61000000-0000-4000-8000-0000000000b2', 15000, 0.8400, 1260000, true),
  ('20000000-0000-4000-8000-00000000000b', '61000000-0000-4000-8000-0000000000b3', 5000, 2.1000, 1050000, false);

-- ------------------------------------------------------------------- orders
-- Timeline events are written explicitly here (with past dates), so the
-- automatic status-logging trigger is paused while seeding.
alter table public.orders disable trigger trg_log_order_status;

insert into public.orders (id, organization_id, order_no, kind, status, client_po_no, delivery_address_id, delivery_address_snapshot, requested_delivery_date, quote_id, placed_by, placed_at, confirmed_by, confirmed_at, delivered_at) values
  ('70000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 'PA-2026-000101', 'reorder', 'closed',     'PO-ABC-8812', '30000000-0000-4000-8000-0000000000a1', '{"label":"Head office","city":"Makati City"}', '2026-03-20', null, '10000000-0000-4000-8000-0000000000a2', '2026-03-02', '10000000-0000-4000-8000-000000000002', '2026-03-02', '2026-03-18'),
  ('70000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 'PA-2026-000187', 'reorder', 'printing',   'PO-ABC-9120', '30000000-0000-4000-8000-0000000000a2', '{"label":"Warehouse – Laguna","city":"Cabuyao"}', current_date + 5, null, '10000000-0000-4000-8000-0000000000a1', now() - interval '6 days', '10000000-0000-4000-8000-000000000002', now() - interval '6 days', null),
  ('70000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', 'PA-2026-000203', 'new',     'submitted',  null, '30000000-0000-4000-8000-0000000000a1', '{"label":"Head office","city":"Makati City"}', current_date + 9, null, '10000000-0000-4000-8000-0000000000a2', now() - interval '2 hours', null, null, null),
  ('70000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 'PA-2026-000150', 'reorder', 'delivered',  'SF-PO-3301', '30000000-0000-4000-8000-0000000000b1', '{"label":"Plant – Valenzuela","city":"Valenzuela City"}', current_date - 8, '61000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b2', now() - interval '18 days', '10000000-0000-4000-8000-000000000003', now() - interval '18 days', now() - interval '9 days'),
  ('70000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 'PA-2026-000199', 'reorder', 'waiting_for_client_approval', 'SF-PO-3388', '30000000-0000-4000-8000-0000000000b1', '{"label":"Plant – Valenzuela","city":"Valenzuela City"}', current_date + 12, null, '10000000-0000-4000-8000-0000000000b1', now() - interval '3 days', '10000000-0000-4000-8000-000000000003', now() - interval '3 days', null),
  ('70000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 'PA-2026-000205', 'reorder', 'on_hold',    null, '30000000-0000-4000-8000-0000000000b1', '{"label":"Plant – Valenzuela","city":"Valenzuela City"}', current_date + 15, null, '10000000-0000-4000-8000-0000000000b2', now() - interval '1 day', '10000000-0000-4000-8000-000000000003', now() - interval '1 day', null);

alter table public.orders enable trigger trg_log_order_status;

insert into public.order_items (id, organization_id, order_id, print_item_id, product_id, title, quantity, spec_snapshot, artwork_version_id) values
  ('71000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', null, 'Product Brochure A4 Trifold', 2000, '{"size":"A4 open","material":"Gloss Art","gsm":150,"colors":"4/4"}', '51000000-0000-4000-8000-0000000000a5'),
  ('71000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', '50000000-0000-4000-8000-0000000000a4', null, 'Shipping Box Medium', 1000, '{"size":"12 x 10 x 8 in","material":"SBS Board","gsm":300}', '51000000-0000-4000-8000-0000000000a4'),
  ('71000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a3', null, '41000000-0000-4000-8000-000000000005', 'Business Cards – Ramon Garcia', 200, '{"size":"2x3.5in","material":"Carolina C2S","gsm":300,"colors":"4/4"}', null),
  ('71000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', null, 'Sunrise Mango Jam Label 80x50', 15000, '{"size":"80 x 50 mm","material":"Gloss Sticker"}', '51000000-0000-4000-8000-0000000000b1'),
  ('71000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b2', '50000000-0000-4000-8000-0000000000b2', null, 'Shelf Price Tag', 5000, '{"size":"60 x 30 mm","material":"Matte Sticker"}', '51000000-0000-4000-8000-0000000000b2'),
  ('71000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b3', '50000000-0000-4000-8000-0000000000b4', null, 'Corrugated Carton Large', 2000, '{"size":"18 x 12 x 10 in","material":"B-flute corrugated"}', '51000000-0000-4000-8000-0000000000b4');

insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos, vat_inclusive, price_source) values
  ('71000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 13.1000, 2620000, true, 'estimate'),
  ('71000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 41.9500, 4195000, false, 'estimate'),
  ('71000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', 4.2500, 85000, true, 'standard'),
  ('71000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 0.8400, 1260000, true, 'quote'),
  ('71000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 0.6500, 325000, true, 'estimate'),
  ('71000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 31.0000, 6200000, true, 'manual');

insert into public.order_financials (order_id, organization_id, net_centavos, vat_centavos, total_centavos) values
  ('70000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-00000000000a', 2339286, 280714, 2620000),
  ('70000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 4195000, 503400, 4698400),
  ('70000000-0000-4000-8000-0000000000a3', '20000000-0000-4000-8000-00000000000a', 75893, 9107, 85000),
  ('70000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 1125000, 135000, 1260000),
  ('70000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 290179, 34821, 325000),
  ('70000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-00000000000b', 5535714, 664286, 6200000);

insert into public.payments (organization_id, order_id, method, reference_no, bank, amount_centavos, received_on, notes, recorded_by) values
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'bank_transfer', 'BDO-TRX-558812', 'BDO Unibank', 2620000, '2026-03-25', 'Full payment', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', 'cheque', 'CHK 004512', 'Metrobank', 2349200, current_date - 5, '50% down payment', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', 'cheque', 'CHK 778201', 'BPI', 630000, current_date - 9, 'First of two post-dated cheques', '10000000-0000-4000-8000-000000000003');

insert into public.order_status_events (organization_id, order_id, from_status, to_status, note, actor_id, created_at) values
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', null, 'submitted', null, '10000000-0000-4000-8000-0000000000a2', '2026-03-02 09:10+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'submitted', 'confirmed', 'Same artwork as 2025 run.', '10000000-0000-4000-8000-000000000002', '2026-03-02 11:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'confirmed', 'printing', null, '10000000-0000-4000-8000-000000000004', '2026-03-06 08:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'printing', 'finishing', 'Folding', '10000000-0000-4000-8000-000000000004', '2026-03-10 15:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'finishing', 'quality_check', null, '10000000-0000-4000-8000-000000000004', '2026-03-13 10:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'quality_check', 'out_for_delivery', null, '10000000-0000-4000-8000-000000000004', '2026-03-17 08:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'out_for_delivery', 'delivered', 'Received by guard on duty', '10000000-0000-4000-8000-000000000004', '2026-03-18 14:20+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a1', 'delivered', 'closed', null, '10000000-0000-4000-8000-000000000002', '2026-03-26 09:00+08'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', null, 'submitted', null, '10000000-0000-4000-8000-0000000000a1', now() - interval '6 days'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', 'submitted', 'confirmed', null, '10000000-0000-4000-8000-000000000002', now() - interval '6 days' + interval '2 hours'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', 'confirmed', 'prepress', null, '10000000-0000-4000-8000-000000000002', now() - interval '5 days'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', 'prepress', 'approved_for_print', null, '10000000-0000-4000-8000-000000000002', now() - interval '4 days'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a2', 'approved_for_print', 'printing', 'On the Sord press', '10000000-0000-4000-8000-000000000004', now() - interval '1 day'),
  ('20000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-0000000000a3', null, 'submitted', null, '10000000-0000-4000-8000-0000000000a2', now() - interval '2 hours'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', null, 'submitted', null, '10000000-0000-4000-8000-0000000000b2', now() - interval '18 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', 'submitted', 'confirmed', null, '10000000-0000-4000-8000-000000000003', now() - interval '18 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', 'confirmed', 'printing', null, '10000000-0000-4000-8000-000000000004', now() - interval '14 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', 'printing', 'out_for_delivery', null, '10000000-0000-4000-8000-000000000004', now() - interval '10 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b1', 'out_for_delivery', 'delivered', null, '10000000-0000-4000-8000-000000000004', now() - interval '9 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b2', null, 'submitted', null, '10000000-0000-4000-8000-0000000000b1', now() - interval '3 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b2', 'submitted', 'confirmed', null, '10000000-0000-4000-8000-000000000003', now() - interval '3 days'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b2', 'confirmed', 'waiting_for_client_approval', 'New price on tag — please approve the proof.', '10000000-0000-4000-8000-000000000003', now() - interval '1 day'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b3', null, 'submitted', null, '10000000-0000-4000-8000-0000000000b2', now() - interval '1 day'),
  ('20000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-0000000000b3', 'submitted', 'on_hold', 'Waiting for board stock from supplier.', '10000000-0000-4000-8000-000000000003', now() - interval '20 hours');

update public.print_items set source_order_id = null;  -- items were imported, not created from orders
insert into public.order_number_counters (year, last_value) values (2026, 205);
insert into public.doc_counters (kind, year, last_value) values ('quote_request', 2026, 5), ('quote', 2026, 3);

-- a few in-app notifications
insert into public.notifications (profile_id, organization_id, kind, title, body, link) values
  ('10000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-00000000000b', 'proof_ready', 'Proof ready for your approval', 'PA-2026-000199 · Shelf Price Tag', '/app/orders/70000000-0000-4000-8000-0000000000b2'),
  ('10000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-00000000000b', 'quote_ready', 'Your quote is ready', 'Roll-up standees for trade fair', '/app/quotes/60000000-0000-4000-8000-0000000000b1'),
  ('10000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-00000000000a', 'status_changed', 'Order is printing', 'PA-2026-000187 · Shipping Box Medium', '/app/orders/70000000-0000-4000-8000-0000000000a2');

insert into public.audit_logs (actor_id, actor_email, organization_id, action, entity_type, entity_id, meta) values
  ('10000000-0000-4000-8000-000000000001', 'admin@pa-demo.test', null, 'seed.loaded', 'system', null, '{"note":"Demo data loaded"}');

-- Demo notices are history: never push them to phones.
update public.notifications set pushed_at = created_at where pushed_at is null;
