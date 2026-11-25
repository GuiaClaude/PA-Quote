-- ============================================================================
-- 0010  Default settings for a brand-new (live) project.
--       Safe to re-run: existing values are never overwritten.
-- ============================================================================

insert into public.settings (key, value, visibility, description) values
('company', '{"name":"Print Amplified","legal_name":"","address":"","phone":"","email":"","website":"https://www.printamplified.com"}',
  'public', 'Company details shown in the app, emails and quotes'),
('branding', '{"primary":"#00AEBF","accent":"#E0295A","logo_path":null}', 'public', 'Logo and brand colours'),
('payment_instructions', '{"bank_accounts":[],"cheque_payee":"","notes":""}', 'client', 'Bank details and cheque payee shown on every order'),
('email', '{"from_name":"Print Amplified","from_email":"orders@order.printamplified.com","reply_to":""}', 'staff', 'Sender details for notification emails'),
('security', '{"require_mfa":true,"web_session_hours":12,"app_session_days":30,"lockout_max_attempts":5,"lockout_minutes":15}',
  'staff', 'Login security'),
('uploads', '{"max_file_mb":50}', 'client', 'Maximum upload size (50 MB on Supabase Free; 100 MB on Pro)'),
('features', '{"ai_autofill_enabled":false}', 'staff', 'Optional paid features')
on conflict (key) do nothing;

insert into public.pricing_settings (version_no, rounding_step_pesos, rounding_scope, vat_rate_pct, quote_validity_days,
  max_estimate_age_years, max_adjustment_pct, show_breakdown_to_clients, quote_reply_target_hours, effective_from)
values (1, 5, 'order_total', 12.00, 15, 3.0, 20.00, false, 24, '2020-01-01')
on conflict (version_no) do nothing;

-- Suggested starting values: PSA headline inflation (annual averages).
-- Marked "needs confirmation" — management must verify and edit them.
insert into public.inflation_rates (year, rate_pct, source_note, needs_confirmation, effective_from)
select v.year, v.rate, v.note, true, '2020-01-01'
from (values
  (2019, 2.400, 'PSA headline inflation (annual average) — please confirm'),
  (2020, 2.400, 'PSA headline inflation (annual average) — please confirm'),
  (2021, 3.900, 'PSA headline inflation (annual average) — please confirm'),
  (2022, 5.800, 'PSA headline inflation (annual average) — please confirm'),
  (2023, 6.000, 'PSA headline inflation (annual average) — please confirm'),
  (2024, 3.200, 'PSA headline inflation (annual average) — please confirm'),
  (2025, 1.700, 'PSA headline inflation (annual average) — please confirm'),
  (2026, 2.000, 'Placeholder for the current year — management to set')
) as v(year, rate, note)
where not exists (select 1 from public.inflation_rates);
