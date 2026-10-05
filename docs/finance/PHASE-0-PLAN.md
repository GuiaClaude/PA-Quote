# Print Amplified Finance — Phase 0 Plan

Status: **draft for owner approval**. No application code has been written yet.
Prepared 10/05/2026.

> **Sample files.** Five of the six workbooks were provided on 10/05/2026 (Sales "OUTPUT 2024", Purchases "INPUT 2024", Accounts Payable, Billing-Collection-SOA, and the Payroll Register for 09/01–09/15/2026). They were read for **structure only**: sheet names, title and header rows, merged cells, colours, formulas, and the *shape* of values (letters → `a`, digits → `9`). They are stored only in the git-ignored `samples/` folder and are not copied into this document, tests or seed data. **Still missing: the BPI BizLink "Pay BPI Accounts" report (.xls).** §5.2 describes what was found.

---

## 0. What's already in this repo

| Item | Notes |
|---|---|
| `src/App.jsx` (≈130 KB) | **PA-Quote**, the existing *Cost Estimator & CE Builder* (Vite + React, data saved in browser `localStorage`). |
| CE number formats in use | `PA-CE-2026-0001`, `PA-CE-2026-ACME-0001` (with a client code), `PA-CE-202610-0001`. The finance app's Projects module will accept all three, and treat them as the same key after normalising case and spaces. |
| Housekeeping (no changes made) | A duplicate `App.jsx` at the root (differs from `src/App.jsx`), an empty file named `git`, and a committed `dist/` folder even though `.gitignore` excludes it. I'd tidy these in Phase 1 with your OK. |

**Proposal:** build the finance app as a separate Next.js app in `finance/` inside this repo, and leave PA-Quote untouched and deployable as it is. Later (optional) the CE builder can save CEs straight into the finance database, so every billing links to a job automatically (Q3).

---

## 1. Architecture

```
               ┌───────────────────────── Vercel (Next.js App Router, TypeScript) ─────────────────────────┐
 Browser ──────▶  UI (React Server Components + shadcn/ui + Recharts)                                       │
 (owner,        │  Server Actions / Route Handlers  ──▶  Domain layer (pure TS: parsing, VAT, posting,     │
 bookkeeper,    │                                         aging, dedupe) ── unit-tested with Vitest        │
 viewer)        │  /api/webhooks/google  /api/webhooks/dropbox  /api/inngest                               │
                └───────────┬───────────────────────────────┬──────────────────────────────┬───────────────┘
                            │ SQL in transactions (RLS on)   │ events                       │
                            ▼                               ▼                              ▼
   ┌──────────────── Supabase ─────────────────┐   ┌──────── Inngest (job runner) ───────┐   External
   │ Postgres: ledger + documents + sync state │◀──│ import.file, sync.sheet, sync.folder │──▶ Google Sheets/Drive API
   │   • RLS on every table (org + role)       │   │ cron: poll sheets (2 min), renew     │──▶ Dropbox API
   │   • balanced-entry constraint trigger     │   │   watch channels, scheduled reports, │──▶ Anthropic API (insights)
   │   • period-lock trigger, audit trigger    │   │   insights refresh, nightly backup   │──▶ Resend (email)
   │ Auth (email+password, Google, TOTP 2FA)   │   │ retries + idempotency keys           │
   │ Storage (private buckets: imports,        │   └──────────────────────────────────────┘
   │   attachments, reports, backups)          │
   │ Realtime ──▶ browser ("data changed" ping)│
   └───────────────────────────────────────────┘
```

### Key decisions (and where I'd change the spec)

| Topic | Decision | Why |
|---|---|---|
| Job runner | **Inngest** | Works natively with Vercel, has durable steps, automatic retries, cron and per-event idempotency keys. The free tier covers this workload. Vercel's own cron is daily-only on Hobby, which is too slow for 2-minute polling. |
| Database access | **Drizzle ORM over a direct Postgres connection** for writes; `supabase-js` for auth, storage and realtime | Posting a billing touches 3–5 tables and must happen in **one transaction**, which `supabase-js` can't do. Every server transaction starts with `SET LOCAL ROLE authenticated` + the user's JWT claims, so **RLS still applies** to server code. Background jobs run as a restricted `service_worker` role that is scoped to one org. |
| Money | **`bigint` centavos** in the database and integers in TypeScript | Exact, fast to sum, and no float errors. One helper formats `₱1,234,567.89`. VAT splitting uses a single rounding rule (round half up to the centavo, with VAT = gross − net so the parts always add back to the total). |
| Dates | Business dates are `date` (no time); events are `timestamptz`; all display and period maths use **Asia/Manila**; weeks run Mon–Sun | Avoids invoices dated 07/01 showing up in June because of UTC. |
| Accounting engine | Documents (billing, collection, bill, payment, payroll run, bank fee) are the source of truth. A **pure TypeScript posting function** turns each document into journal lines. If the document changes in an open period, its entry is **reversed and reposted**. | Easy to test ("always balanced"), easy to explain, and gives a full audit trail. Manual journal entries are allowed for the bookkeeper. |
| Balance guarantee | A deferred constraint trigger on `journal_lines` rejects the commit if Σ debit ≠ Σ credit for any entry, or if an entry has fewer than 2 lines | The guarantee lives in the database, not just the app. |
| Live updates | After each committed import or edit, the app bumps `org_data_versions`, and the browser subscribes to that one row through Supabase Realtime and refetches what is on screen | A 2,000-row import then sends 1 ping, not 2,000. |
| **Google connection** | **Service account (recommended)** instead of per-user OAuth; OAuth is kept as an option | Your account is a personal `@gmail.com`, not Google Workspace. An unverified OAuth app in "Testing" mode issues refresh tokens that **expire every 7 days**, and Drive read scopes are "restricted", which means Google wants a paid security assessment before an app can be published. With a service account, you simply **share** the sheet or folder with an email like `pa-finance@your-project.iam.gserviceaccount.com`. It never expires, needs no verification, and push notifications still work. (Q5) |
| Excel libraries | **SheetJS 0.20.x from the SheetJS CDN** for reading; **ExcelJS** for styled exports | The `xlsx` package on npm is stuck at 0.18.5 with known security advisories. SheetJS also reads BPI's legacy `.xls` (including the "HTML table saved as .xls" variant some banks produce). |
| PDF | `@react-pdf/renderer` on the server | Runs on Vercel, and invoices, SOAs and reports share React components. |
| AI | Anthropic API with a model configured by env var (default: latest Sonnet). Numbers are computed in SQL first; the model only receives aggregates and calls read-only tool functions. | As the spec requires. |

### Hosting costs to expect (please confirm you're OK with these)

- **Supabase Pro, US$25/mo:** recommended. The free plan pauses after a week of inactivity and has no downloadable backups.
- **Vercel Pro, US$20/mo:** Vercel's Hobby plan is for **non-commercial** use only. Alternatives are Netlify or Render; the app is portable.
- **Inngest:** free tier. **Resend:** free up to 3,000 emails a month. **Anthropic API:** pay-per-use, likely a few US$ a month at this volume.
- **Google Cloud:** free (Sheets/Drive API quotas are generous). **Dropbox app:** free.

---

## 2. Database schema

Conventions on **every** business table: `id uuid pk`, `org_id uuid not null`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (soft delete), and import lineage `source_type`, `source_id`, `source_row_key`, `content_hash`, with a **unique index on (`org_id`, `source_type`, `source_id`, `source_row_key`)** so a re-sync is an upsert. Amounts are `bigint` centavos (`_c` suffix below is implied for money).

### 2.1 Tenancy, users, security

| Table | Key columns |
|---|---|
| `organizations` | name, legal_name, tin, branch_code, rdo_code, address, vat_registered, fiscal_year_start_month, timezone, settings jsonb |
| `profiles` | user_id → auth.users, full_name, phone |
| `memberships` | org_id, user_id, role `owner/bookkeeper/viewer`, mfa_required |
| `audit_log` | org_id, actor_id, action `create/update/delete/restore/import/post/reverse/lock/unlock/login`, table_name, record_id, before jsonb, after jsonb, reason, ip, at. Written by a generic trigger; **insert-only**, so nobody (Owner included) can update or delete it. |
| `period_locks` | org_id, period_start, period_end, locked_by, locked_at, unlocked_by, unlocked_at, unlock_reason. A trigger blocks any insert, update or delete on dated documents and journal entries inside a locked period. |
| `org_data_versions` | org_id, version bigint, changed_tables text[], at (Realtime ping) |

RLS helpers (SECURITY DEFINER, `stable`): `is_member(org)`, `has_role(org, roles[])`.
Policies: **viewer** can select only; **bookkeeper** can select, insert and update in open periods (no hard delete, no unlock, no user admin, no tax-rate edits); **owner** can do everything, but can unlock only through a function that writes an audit row.

### 2.2 Parties & jobs

| Table | Key columns |
|---|---|
| `clients` | name, display_name, tin (9 digits), tin_branch (3–5 digits), address, contact_person, email, phone, terms_days (default 30), vat_status `vat/non_vat/zero_rated/exempt`, cwt_rate_bp (basis points, e.g. 200 = 2%), is_twa (top withholding agent), notes, merged_into_id |
| `suppliers` | same as clients + payee_account_name, bank_details, default_expense_account_id, default_category, ewt_rate_bp, supplier_type `goods/services/professional/rental/…` |
| `party_aliases` | org_id, party_type, party_id, alias_normalized, source, approved_by. Remembers e.g. "Acme Prntng Corp" → ACME PRINTING CORP. so future imports auto-resolve. |
| `merge_candidates` | party_type, a_id, b_id, score, reason (`tin_match`, `name_similarity 0.93`), status `pending/merged/dismissed` |
| `projects` | ce_number (unique per org, normalised), po_number, client_id, name/description, job_type (offset, digital, large format, …), quoted_amount, status `quoted/ongoing/completed/billed/cancelled`, start_date, end_date |

### 2.3 Sales side

| Table | Key columns |
|---|---|
| `billings` | doc_type `sales_invoice/billing_invoice/billing_statement/or_converted_invoice`, invoice_nos text[] (one row can carry several numbers), invoice_no, billing_statement_no, series_id, client_id, project_id, billing_date, terms_days, due_date, po_number, job_type (Business Cards, Stickers, Flyers…), delivery_date, terms_text (COD, 30 DAYS PDC, 50% DP 50% FP), vat_treatment `vat/zero_rated/exempt/non_vat`, gross_amount, net_of_vat, output_vat, cwt_expected, status `draft/billed/for_collection/due_follow_up/paid/rejected/void`, rejected_reason, remarks, journal_entry_id |
| `billing_lines` | billing_id, description, qty, unit_price, amount, revenue_account_id, project_id |
| `collections` | receipt_type `sales_invoice/official_receipt/collection_receipt/acknowledgement_receipt/none`, receipt_no (OR# for legacy data, CR#, AR#), client_id, collection_date, payment_mode `cash/bank_deposit/cheque_deposit/cheque_pickup/online_bank/bank_wire/gcash/offsetting`, payment_reference, cheque_no, cheque_date, bank_account_id, amount_received, cwt_amount, form_2307_status `not_required/pending/received/for_revision`, form_2307_received_date, form_2307_attachment_id, deposited_date, journal_entry_id |
| `collection_allocations` | collection_id, billing_id, amount_applied, cwt_applied (partial payments; one collection can settle many billings) |
| `follow_up_notes` | billing_id, note (Taglish OK), next_follow_up_date, by, at |
| `doc_series` | doc_kind (sales_invoice, billing_statement, OR, CR…), prefix, start_no, end_no, atp_or_registration_no, valid_from. Used by the register's gap and duplicate check. |
| `void_numbers` | series_id, number, reason (so an intentional gap isn't flagged) |

### 2.4 Purchases side

| Table | Key columns |
|---|---|
| `purchases` | doc_type `sales_invoice/official_receipt/collection_receipt/billing_invoice/cash_invoice/delivery_receipt/acknowledgement/none`, reference_no, or_cr_no, ar_no, supplier_id, project_id (CE#), invoice_date, due_date, vat_treatment, total_amount, net_amount, input_vat, ewt_amount, description, expense_type `direct_materials/overhead_fixed/overhead_non_fixed`, terms_text, approval_status `to_be_processed/for_revision/approved_in_process/paid/unpaid`, payment_status `open/partially_paid/paid/void`, sent_to_platform (Spenmo/BizLink), with_2307 bool, no_receipt bool (no input VAT claimed), journal_entry_id |
| `purchase_lines` | purchase_id, expense_category_id, account_id, class `goods/services/capital_goods`, amount, input_vat, project_id |
| `expense_categories` | name: your 34 AP categories (Paper, CTP/Negatives, Finish, Postpress, Bindery, Job-Out, Supplies – Press/Office/Cleaning/…, Repairs – Main Machine/Office/Vehicle, …), default expense_type, default_account_id, **bir_summary_column** (one of the 26 INPUT-summary columns), class goods/services/capital_goods, header_synonyms text[] (used by the importer) |
| `ap_payments` | supplier_id, payment_date, payment_mode `bizlink/bank_transfer_spenmo/gcash_spenmo/gcash_reimbursement/cheque/bpi_check/cash/lalamove_wallet/paymaya/credit_card/project_offsetting`, via_platform, bizlink_reference, check_date, check_status `posted/unposted`, bank_account_id, cheque_no, amount, ewt_withheld, reference_no, journal_entry_id |
| `ap_payment_allocations` | ap_payment_id, purchase_id, amount_applied |

### 2.5 Bank

| Table | Key columns |
|---|---|
| `bank_accounts` | name, bank (BPI), account_no_masked, type `current/savings/ewallet/clearing`, gl_account_id, opening_balance, opening_date |
| `bank_transactions` | bank_account_id, txn_date, value_date, description, reference_no, debit, credit, running_balance, status (from report), import_batch_id, external_id (BPI ref) |
| `bank_matches` | bank_transaction_id, matched_type `collection/ap_payment/payroll_run/remittance/journal_entry`, matched_id, amount, method `auto/manual`, confidence, matched_by |
| `bank_reconciliations` | bank_account_id, statement_date, statement_balance, book_balance, reconciled_by, locked |

### 2.6 Payroll

| Table | Key columns |
|---|---|
| `employees` | employee_no, name, tin, sss_no, phic_no, hdmf_no, position, basic_monthly_rate, daily_rate, hourly_rate, status, hire_date, separation_date (sensitive; viewers can't see this table) |
| `payroll_runs` | period_start, period_end, pay_date, cutoff `first_half/second_half`, status `draft/posted/paid`, journal_entry_id |
| `payroll_lines` | run_id, employee_id, hours, basic_pay, night_diff, regular_ot, holiday_pay, special_holiday_pay, rest_day_pay, allowance, de_minimis, reimbursement, lates, absences, undertime, gross_pay, sss_ee, sss_er, sss_ec, phic_ee, phic_er, hdmf_ee, hdmf_er, wtax, loans jsonb, other_deductions, net_pay |
| `gov_remittances` | agency `sss/phic/hdmf/bir_1601c/bir_0619e/bir_1601eq/bir_2550q`, period, amount, paid_date, reference_no, attachment_id, journal_entry_id |
| `rate_tables` | kind `sss/phic/hdmf/wtax_compensation/ewt/cwt/vat`, effective_from, effective_to, table jsonb, notes, approved_by. **Editable, never hard-coded.** |

### 2.7 Ledger

| Table | Key columns |
|---|---|
| `accounts` | code, name, type `asset/liability/equity/revenue/cogs/expense/other_income/other_expense`, subtype, normal_side, parent_id, is_system (system accounts can be renamed but not deleted), is_active, tax_tag (input_vat, output_vat, cwt, …) |
| `journal_entries` | entry_no (sequential per year), entry_date, memo, source_doc_type, source_doc_id, kind `auto/manual/reversal/closing/opening`, reverses_id, posted_at, posted_by |
| `journal_lines` | entry_id, account_id, debit, credit (CHECK one side zero, both ≥ 0), party_type/party_id, project_id, memo |
| Views | `v_account_balances(org, account, date)`, `v_trial_balance(from,to)`, `v_ar_open_items`, `v_ap_open_items`, plus summary tables refreshed by triggers if needed for 50k+ rows |

### 2.8 Tax settings

| Table | Key columns |
|---|---|
| `tax_settings` | effective_from, vat_rate_bp (1200), **vat_basis `billed/collected`** per period range, default_cwt_rate_bp, input_vat_method, reminders on/off, filing due-day rules jsonb (editable), "confirm with accountant" acknowledged_by/at |

### 2.9 Imports & sync

| Table | Key columns |
|---|---|
| `data_sources` | kind `upload/google_sheet/google_drive_folder/dropbox_folder/manual`, name, config jsonb (spreadsheet id + tab, folder path…), auth_id, mapping_id, status, poll_interval_s, last_synced_at, last_success_at, consecutive_failures, watch_channel_id, watch_expires_at, cursor (Dropbox) |
| `oauth_connections` | provider, account_email, **encrypted_refresh_token** (AES-256-GCM with `TOKEN_ENCRYPTION_KEY`), scopes, expires_at |
| `import_mappings` | name, format `sales_summary/purchase_summary/billing_workbook/ap_workbook/bpi_report/payroll_register/custom`, target_entity, sheet_pattern, header_row_hint, column_map jsonb (header synonyms → field), transforms jsonb, fingerprint (header signature for auto-detect), version |
| `sync_runs` / import batches | data_source_id, file_name, file_hash, storage_path, trigger `upload/webhook/poll/manual/retry`, started_at, finished_at, status, counts (read, inserted, updated, unchanged, skipped, errored, flagged_deleted), error, idempotency_key |
| `import_rows` | sync_run_id, sheet, row_number, source_row_key, raw jsonb, normalized jsonb, content_hash, outcome `inserted/updated/unchanged/skipped/error/needs_review/deleted_in_source`, messages jsonb, target_table, target_id |
| `review_queue` | kind `unmatched_file/unmapped_column/party_match/possible_duplicate/deleted_in_source/date_ambiguous/validation_error`, payload, status, resolved_by |
| `attachments` | bucket, path, mime, size, sha256, linked_type, linked_id, kind `invoice/2307/deposit_slip/or/payroll/other` |
| `report_schedules` | report_key, frequency `weekly/monthly/quarterly/yearly`, params jsonb, recipients text[], formats `pdf/xlsx`, next_run_at, last_run_at |
| `report_runs` | schedule_id, period, files (storage paths), emailed_at, status |
| `insights` | period, kind, title, body, source_figures jsonb (the numbers shown beside the text), model, generated_at, data_version |

---

## 3. Chart of accounts (default, editable)

Fixed codes so the posting rules can find accounts. Names can be renamed.

| Code | Account |
|---|---|
| **1000 Assets** | |
| 1010 / 1020 | Cash on Hand / Petty Cash Fund |
| 1030 / 1031 | Cash in Bank – BPI Current / BPI Savings |
| 1040 / 1045 | GCash / Spenmo Wallet (clearing) |
| 1050 | Undeposited Collections (cheques on hand) |
| 1100 / 1110 | Accounts Receivable – Trade / Allowance for Doubtful Accounts |
| 1150 / 1160 | Advances to Employees / Advances to Suppliers |
| 1200 | Printing Supplies Inventory (optional; purchases are expensed by default) |
| 1300 | Input VAT |
| 1310 | Creditable Withholding Tax (2307) |
| 1320 | Prepaid Income Tax / Excess Tax Credits |
| 1400 / 1600 | Prepaid Expenses / Security & Rental Deposits |
| 1500–1550 | Printing Machinery & Equipment, Office Equipment, Furniture & Fixtures, Transportation Equipment, Leasehold Improvements |
| 1590 | Accumulated Depreciation |
| **2000 Liabilities** | |
| 2010 / 2020 | Accounts Payable – Trade / Accrued Expenses |
| 2100 / 2105 / 2110 | Output VAT / **Deferred Output VAT (uncollected)** / VAT Payable |
| 2200 / 2210 | Withholding Tax Payable – Compensation / – Expanded |
| 2300 / 2310 / 2320 / 2330 | SSS / PhilHealth / Pag-IBIG Payable / SSS & HDMF Loans Payable |
| 2400 | Salaries Payable |
| 2500 | Customer Deposits & Down Payments |
| 2600 / 2700 / 2800 | Income Tax Payable / Loans Payable / Due to Stockholder (OPC owner advances) |
| **3000 Equity** | 3010 Share Capital, 3100 Retained Earnings, 3200 Current Year Earnings (computed), 3300 Dividends |
| **4000 Revenue** | 4010 Printing Revenue – Offset, 4020 – Digital, 4030 – Large Format, 4040 Design & Pre-press, 4090 Other Services, 4100 Sales Returns & Discounts (contra), 4900 Other Income |
| **5000 Cost of Sales** (your "Direct Materials" type) | 5010 Paper, 5015 CTP / Plates / Negatives, 5020 Job-Out (outsourced printing), 5030 Finishing, 5035 Postpress, 5040 Bindery, 5045 Supplies – Press, 5046 Supplies – Postpress/Bindery/Finish, 5050 Direct Labor, 5060 Delivery on Jobs |
| **6000 Operating Expenses** | 6010 Salaries & Wages, 6020 SSS/PHIC/HDMF – Employer, 6030 13th Month & Bonuses, 6040 Allowances & De Minimis, 6100 Office Supplies, 6110 Meals, 6120 Representation, 6130 Fuel & Oil, 6140 Repairs – Main Machine, 6141 Repairs – Office/Press Area, 6142 Repairs – Vehicle, 6145 Supplies – Cleaning, 6148 Management Expenses, 6150 Transportation & Travel, 6155 Fare / Terminal Fees, 6160 Light & Power (Electricity), 6165 Water, 6170 Communication & Internet, 6175 Courier & Freight, 6180 Rent, 6185 Hotel & Accommodation, 6190 Professional Fees, 6200 Security Services, 6210 Janitorial, 6220 Taxes & Licenses, 6230 Insurance, 6240 Depreciation, 6250 Bank & Spenmo Charges, 6260 Bad Debts, 6290 Miscellaneous |
| **7000 Other / Tax** | 7010 Interest Expense, 7090 Income Tax Expense |

Each of your 34 AP categories maps to one account above, and each account is tagged with (a) its **INPUT-summary column** (Printing Supplies, Office Supplies, Meals… the 26 columns in your BIR summary) and (b) goods/services/capital goods. Both your operational expense report and the BIR purchases summary then come from the same entries. Your Expense Type (Direct Materials / Overhead Fixed / Overhead Non-Fixed) is kept as a reporting dimension. You decide whether paper and press supplies are cost of sales (my recommendation) or carried as inventory (Q9).

---

## 4. Posting rules (all generated automatically)

Example: a VAT sale billed at G = ₱11,200.00, so net = ₱10,000.00 and VAT = ₱1,200.00.

| Event | Debit | Credit |
|---|---|---|
| **Billing** (VAT basis = *billed*) | 1100 AR G | 40xx Revenue net · 2100 Output VAT vat |
| **Billing** (VAT basis = *collected*) | 1100 AR G | 40xx Revenue net · **2105 Deferred Output VAT** vat |
| **Collection** of cash C with CWT W | 1030/1040/1050 C · 1310 CWT W | 1100 AR C + W |
| ↳ extra entry when basis = *collected* | 2105 Deferred Output VAT (C+W) × 12/112 | 2100 Output VAT |
| Down payment before billing | Cash | 2500 Customer Deposits (applied when the billing is issued) |
| **Bill from supplier** (VAT) | 5xxx/6xxx Expense net · 1300 Input VAT | 2010 AP total − EWT · 2210 EWT Payable (if we withhold) |
| Non-VAT supplier | Expense full amount | AP |
| **AP payment** | 2010 AP | 1030 BPI / 1040 GCash / 1045 Spenmo |
| Spenmo top-up | 1045 Spenmo | 1030 BPI |
| **Payroll run** | 6010 gross pay · 6020 employer shares | 2300/2310/2320 (EE + ER) · 2200 WTax · 2330 loans · 2400 Salaries Payable (net) |
| Payroll payout / remittance | 2400 / 23xx / 22xx | 1030 BPI |
| Quarter VAT close (2550Q) | 2100 Output VAT | 1300 Input VAT · 2110 VAT Payable (difference); the reverse if input > output |
| Bank charge from statement | 6250 Bank Charges | 1030 BPI |
| Void / reject billing | Reversal of the original entry (never deleted) | |

Every rule has a unit test that asserts the entry balances and the account totals match a hand calculation.

---

## 5. Import mapping strategy

### 5.1 Pipeline (shared by upload, Sheets, Dropbox and Drive)

1. **Read**: SheetJS loads every sheet as a raw 2-D grid with formatted and raw values, and detects the 1900 vs 1904 date system.
2. **Classify sheets.** Keep monthly sheets. Skip pivot, summary, quarterly and `Sheet1`-style sheets by name pattern and layout, but **use quarterly sheets as a check-sum**: the sum of the imported months must equal the quarter sheet's total, or the import shows a warning.
3. **Find the header row.** Score each of the first 20 rows by how many cells match known header synonyms. **Two-row headers** are combined: forward-fill the merged parent cell, then join it with the child ("GOODS › PRINTING SUPPLIES"). The title block ("PRINT AMPLIFIED OPC / SUMMARY OF SALES / FOR THE MONTH OF JUNE 2024") is parsed for the **period context**.
4. **Detect the format** using a fingerprint: title keywords, sheet names (BILLING, COLLECTION…) and header synonym coverage. A saved template whose fingerprint scores ≥ 0.8 is applied automatically; otherwise the file goes to the **mapping screen / review queue**.
5. **Map columns by header text** (synonym lists, case/space/punctuation-insensitive, fuzzy ≥ 0.85). Positions are never used, so columns can move between months.
6. **Stop at the end of the data.** Rows starting with TOTAL, GRAND TOTAL or SUB-TOTAL, rows with no date, name or doc no., and the rows after a long run of blanks are skipped and logged as `skipped` with a reason.
7. **Clean.** *Dates*: real dates, Excel serials (e.g. 45470 → 06/28/2024), and text like `02.16.2023`, `4.15.23`, `2/16/23`, `Feb 16, 2023`. Default order is MM/DD. If the first part is > 12 it is read as DD/MM. Then the result is checked against the sheet's month: a date outside it is flagged `date_ambiguous` (not silently fixed). *Amounts*: `PHP 2,130.76`, `₱1,234.00`, `(1,000.00)` → negative, `-`, blank → 0/null, and Excel errors (`#REF!`, `#DIV/0!`, `#N/A`, `#VALUE!`) become a row error. *Text*: trimmed, spaces collapsed, month names normalised ("JULY " → 7). *TIN*: digits only, split into 9 + branch.
8. **Validate with Zod**: required fields, VAT ≈ gross × 12/112 (±₱1.00 tolerance; otherwise flagged, with the sheet's value kept and the difference shown), and net + VAT = gross.
9. **Resolve parties.** TIN match wins. Otherwise use an approved alias, then a fuzzy name match (normalised: uppercase, punctuation removed, CORP/CORPORATION/INC/CO/OPC/LTD/THE dropped, spaces removed; trigram + Jaro-Winkler). ≥ 0.92 → suggested merge in the review queue; below that → a new party. Nothing is merged without your approval, and approvals become aliases.
10. **Dedupe and upsert** on `source_row_key` (natural key, below) + `content_hash`. Same key + same hash → *unchanged*. Same key + new hash → *update* (re-post the journal entry if the period is open; otherwise send it to review). A key that disappears from a live sheet → *deleted_in_source* in the review queue, never auto-deleted.
11. **Post** journal entries in the same transaction, **log** every row to `import_rows`, bump `org_data_versions`, and the dashboard refreshes.

**Cross-source overlap.** The Sales Summary (A) and the Billing workbook (C) describe the **same invoices**, and the Purchases Summary (B) overlaps the AP workbook (D). To avoid double-counting, each record type has one *system of record* (Q2). The other file only **enriches** matching records (adds OR#, PO#, CE#, 2307 flag) and reports mismatches in a reconciliation view.

### 5.2 Per-format mapping (confirmed against your files, structure only)

#### What all the files have in common

| Problem found | How the importer handles it |
|---|---|
| **Phantom columns**: sheets report up to 16,000+ used columns (stray cells far to the right, e.g. column `GNN`) | Read only as far as the last header column; anything beyond is ignored and logged. |
| **Formulas everywhere**: totals typed as `=350+417`, VAT as `=H6/1.12`, input tax as `=Total−SUM(categories)`, and some `#REF!` | Use the value Excel saved for each formula (the cached value). If it is missing or an error, the row goes to review with the formula shown. The app recomputes VAT itself and flags differences over ₱1. |
| **Dates in many forms**: real dates, unformatted Excel serials (e.g. 45,470), `02.16.2023`, `4.15.23`, `2-23-2023`, `6/19/2023`, `9/15/2026`, `February 20, 2024`, `AUGUST , 2026` (no day), and in COLLECTION the day number in one column and the month/year in others | One date parser covering all of these (unit-tested on each shape found), month/day order by default, plus a check that the date falls in the sheet's period, the YEAR/MONTH columns, or the payment date. A date that conflicts or is incomplete goes to review. |
| **Amounts as text**: `99, 999.99` and `99.999.99` (a period used as the thousands separator) | Parsed with the separator rules; anything ambiguous goes to review. |
| **TINs**: `999-999-999`, `-999`, `-9999`, `-99999`, `999-999999999`, `999-999-999-0000` | Normalise to 9 digits + branch code (`000`/`0000`/`00000` all mean head office). |
| **Several documents in one cell**: `#0273/#0274`, `#301, #302 and # 303`, `97 - 98`, `#0212 & #0237`, `435/294` | Split into multiple document numbers linked to one row; the amount isn't split (it stays as one billing with several numbers) unless you split it in review. |
| **Notes inside number cells**: e.g. `#0272 (CANCELS & SUPERSEDES BI#0271)`, `- cancelled` after a client name | Recognised patterns: *cancels & supersedes X* marks X as **void** in the invoice register; *cancelled* sets the status. Everything else is kept in remarks. |
| **Mislabelled headers** (see C below) | The built-in templates map by **position within the recognised header block + header text + content checks**, so a column headed "30 DAYS" is still read as Terms. |
| **Status shown by row colour** (green / yellow / red legend in BILLING) | Fill colour is read and mapped to For Collection / Due for Follow-up / Rejected, and the text status (PAID/UNPAID) wins if both exist. |
| Many spellings of the same value (`NON-VAT`, `NON - VAT`, `Non-vat`, `VATABLE`, `VAT INC.`, `VAT.INC`; `Paid/PAID/PAid`; `BIZLINK/BIZ LINK/BPI BIZLINK`; `W/O 2307`, `W/0 2307`) | Value dictionaries (editable in Settings) map each spelling to one code. |

#### A. Sales summary: `OUTPUT 2024` (12 sheets)

- **Sheets:** monthly (`Jan2024` … `Sept2024`, inconsistent case e.g. `jun2024`) and quarterly (`Apr-jun2024`, `Jul - Sept 2024`, plus a copy `Jul - Sept 2024 (2)`). Quarterly sheets are skipped and used only as check-sums.
- **Title rows 1–3** (merged): company, "SUMMARY OF SALES", "FOR THE MONTH OF …". The title is **not trusted** for the period (e.g. `Sept2024` still says "JULY - SEPT 2024"); the period comes from the sheet name and the dates.
- **Two layouts**, which match the VAT-basis change:
  - **Jan–Mar 2024 (collected basis).** Block 1 header in rows 4–5: `INVOICE NUMBER · GROSS BILLINGS · NET OF VAT · OUTPUT VAT`. Then a **second block** further down with its own header: `CLIENTS NAME · TIN · ADDRESS · OR# · Cash · W/holding Tx · GROSS · BI # · 2307` → collections with CWT and 2307 status. A footer calculates VAT payable from collections.
  - **Apr 2024 onward (billed basis).** One block with a 2-row header: `BILLING INVOICE · BILLING STATEMENT NUMBER · OFFICIAL RECEIPT · GROSS BILLINGS · NET OF VAT · OUTPUT VAT · REMARKS` (PAID/UNPAID). Some sheets (Apr–Jun) have an extra blank column B, which shifts every column right by one; mapping by header text handles this.
- **Collection-style sheet** `Jul - Sept 2024 (2)`: single-row header `OR# · Cash · W/holding Tx · GROSS · BI # · BS # · Note`, with CWT computed as gross ÷ 1.12 × 1% or 2%.
- **Date column A** is sometimes a real date and sometimes an unformatted serial number.
- **Footers** (totals, "VAT payable", signature lines) → detected and skipped.
- **Row key:** invoice no. → billing statement no. → OR no. → hash(date, TIN-or-name, gross) + occurrence.

#### B. Purchases summary: `INPUT 2024` (12 sheets)

- **Sheets:** monthly, quarterly (`Jan-Mar2024`, `Apr-Jun2024 ` with a trailing space), and **`purchase wo ref#`** (purchases with no receipt reference: recorded as expenses, but **no input VAT claimed** unless you say otherwise).
- **Rows 1–2:** a colour legend: **green = goods, yellow = services, red = assets (capital goods)**. **Rows 3–4:** a two-part header, e.g. `Printing / Supplies`, `Repair and / Maintenance`, `Furniture and / Fixtures`.
- **Fixed columns:** `Date · Particulars · Ref. # · TIN · Address · Total · Input Tax` (`Input Tax` = Total − SUM(categories)). Some months have an extra column B.
- **26 category columns** in this order: Printing Supplies, Office Supplies, Meals, Representation, Fuel, Repair & Maintenance, Misc Goods, Transportation Fee, Fare/Terminal Fee/Parking/Toll, Rental, Elec/Water, Telephone, Courier, R&M Services, Misc (services), Freight, Insurance, Representation Services, Professional Fees, Security Guards, Agency Security, Hotel Accommodation, Transportation Equipment, Office Equipment, Furniture & Fixtures, Office Improvements. Goods/services/assets class comes from the **header fill colour** and is stored per category.
- **One row can split across several categories** (e.g. Rental + Elec/Water) → one purchase with several lines.
- **Footer blocks:** VAT working (VAT-exempt sales, input carry-over, **input VAT amortisation 3/60** on capital goods, input current, VAT payable, VAT payments, VAT still due) and an **income-tax working** (total net sales, taxable income to date, prior-year excess, tax credits, income tax payable). These are skipped on import, but the app will reproduce both calculations (§6), including carry-over and capital-goods amortisation.
- **Row key:** supplier TIN-or-name + Ref # + date (+ occurrence).

#### C. Billing & Collection workbook: `BILLING-COLLECTION-SOA` (10 sheets)

- **BILLING** (≈1,200 rows, 2022–2026). Title and colour legend in rows 1–5; **header at row 6**: `YEAR · Month · Date · BILLING TYPE · [Terms, but headed "30 DAYS"] · BILLING REF. # · COMPANY NAME · T. Amount · Project (CE#) · [job type, no header: Business Cards, Stickers, Flyers…] · PO# · CR# · AR# · [PAID/UNPAID, no header] · PAYMENT MODE · PAYMENT REF# · Sales (net) · Output Taxes · AMOUNT PAID · EWT % · EWT AMT · [2307, header is the number 2307] · DELIVERY DATE · REMARKS`.
  - Billing types: `BILLING INVOICE`, `BILLING STATEMENT`, **`OR CONVERTED INVOICE`** (EOPT transition).
  - Terms: COD, 15/30/60/90 days, "30 DAYS PDC", "50% DP 50% FP" (down payment + final payment).
  - EWT %: 1%, 2%, N/A (stored as 0.01/0.02, sometimes as text like "1%%").
  - Billing ref formats: `#9999`, `#999`, `# 999`, a bare number.
- **ON GOING PROJECT**: same columns, header at row 7 → `projects` (status *ongoing / prepare billing*), not billings.
- **COLLECTION** (≈1,100 rows). Header at row 6: `YEAR · [month, but headed "JANUARY"] · Date (day number only) · MONTH (full date text) · COMPANY · TIN NO. · ADDRESS · Project · BILLING TYPE · BILLING # · BILLING / INVOICE AMOUNT · OR CONVERTED INVOICE # · AMOUNT · RECEIPT TYPE · RECEIPT # · AMOUNT PAID · ACCOUNT REFERENCE · WH TAX · [2307 status] · PAYMENT TYPE · DATE OF PAYMENT · DROPDOWN LIST (notes)`.
  - Receipt types: Acknowledgement Receipt, Official Receipt, Collection Receipt.
  - Payment types: Bank Deposit Slip, Cheque Pick-up, Bank Transfer, Bank Wire Transfer, GCash, Cheque Deposit, Cash, Online Bank, Offsetting.
  - 2307 status: OK, W/2307, W/O 2307, FF UP, FOR REVISION, N/A → received / not required / missing (follow up).
  - Notes like "(1st partial)", "(Full Payment)", "CANCELLED", "AR#… CANCELLED SUPERSEDED OR#…" → partial-payment flags and void links.
- **COLLECTION LIST SUMMARY**: header at row 4 (`Month · [date] · COMPANY NAME · PROJECT · BILLING TYPE · BILLING REF. # · T. Amount · TERMS · STATUS · REMARKS`), with Taglish follow-up remarks → `follow_up_notes`.
- **SOA, Sheet7** (per-client statements), **Total Sales & Collection per Mo** (pivot), **Qtrly VAT Payable Estimate**, **Detail2, Sheet2** → skipped; the app generates these itself.
- **CE# format in your data:** `CE#<client code><year>-<nnn>[letter] - <description>` (e.g. shape `CE# ABC2024-001A (…)`), which differs from the PA-Quote app's `PA-CE-2026-0001`. The parser extracts the code part and keeps the description as the project name. Both formats are supported.
- **Row keys:** billing type + billing ref #; collection: receipt type + receipt # (+ billing #).

#### D. Accounts Payable workbook: `PRINT AMPLIFIED AP` (7 sheets)

- **SUMMARY SHEET** (≈4,300 rows, 2022–2026). Header at row 1: `YEAR · MONTH · SUPPLIER · PAYEE ACCOUNT NAME · TIN NO# · REFERENCE # · OR/CR# · AR# · NON-VAT/VAT · INV.DATE · CE# · DESCRIPTION/PROJECT/CE# · Document Type · INV AMOUNT · TERMS · DUE DATE · ADDRESS · MODE OF PAYMENT · REFERENCE (payment ref, e.g. Spenmo bill ID) · DATE OF PAYMENT · STATUS · BIZLINK · CHECK DATE · CHECK STATUS · 2307 (w/ or w/o) · EXPENSE CATEGORY · EXPENSE TYPE · REMARKS · DATE ENCODED`.
  - **VAT column** also encodes the document type (`VAT - SALES INV.`, `VAT - OR`, `VAT - C.R`, `NON-VAT - D.R`…) → split into VAT treatment + document type.
  - **Payment modes:** BPI BizLink (most common), Check Payment, Bank Transfer via Spenmo, GCash via Spenmo, Cash, GCash for Reimbursement, Lalamove wallet, PayMaya, BPI check, credit card, Project Offsetting. Each maps to a **payment account** (BPI, Spenmo wallet, GCash, petty cash, employee reimbursement payable, offset against a client's AR).
  - **Status workflow:** To be processed → Approved – In Process → Paid, plus For revision and Unpaid. This becomes the bill approval workflow in the app.
  - The TERMS column sometimes contains amounts (data entered in the wrong column) → review.
- **Addl Expenses** (≈1,500 rows): same idea with slightly different headers (`COMPANY / SUPPLIER NAME`, `INV #`, `PAYMENT MODE OF D&P`, `Sent to Spenmo/BPI BIZLINK`) → `purchases`.
- **Cash & Check Disbursement**: only a % of total expenses summary (the data was removed) → skipped. **Pivot / Monthly Summary sheets** are empty → skipped.
- **Dropdown Source (DO NOT EDIT)** → seeded as the app's lists:
  - **34 expense categories:** Paper, CTP/Negatives, Finish, Postpress, Bindery, Job-Out, Supplies (Postpress/Bindery/Finish, Office, Cleaning, Press), Salaries & Wages, Management Expenses, Taxes, Licenses, SSS/HDMF contributions and loans, PHIC, Rental, Professional Fees/Commissions, Electricity, Tel./Comm., Insurance, Water (Drinking/Service), Transpo, Representations, Repairs (Main Machine / Main Office-Press Area / Main Vehicle), Loans & Amortizations (Interest), Miscellaneous.
  - **3 expense types:** Direct Materials, Overhead Fixed, Overhead Non-Fixed.
- **Two category systems.** The AP workbook uses *operational* categories (Paper, CTP, Job-Out…) and the INPUT summary uses *BIR summary* categories (Printing Supplies, Office Supplies…). The chart of accounts in §3 is extended so each AP category has its own account, and each account is tagged with its BIR summary column and goods/services/assets class. Both reports then come from the same data.
- **Row key:** supplier TIN-or-name + Reference # (+ OR/CR#).

#### E. BPI BizLink "Pay BPI Accounts Report": **file not yet provided**

- The design is unchanged. Two links are now visible from your other files: the **BIZLINK column** in AP and the **BIZLINK REFERENCE column** in payroll. Together with the BPI reference numbers, these let bank matching link payments to bills and payroll automatically.

#### F. Payroll register: `PAYROLL PERIOD SEPTEMBER 1-15 2026` (4 sheets)

- **PAYROLL REGISTER.** Title rows 1–6 (company, "Payroll Register", `Cut-Off Date: 9/15/2026`, "Payroll for the period covered SEPTEMBER", `HOLIDAYS: N/A`). **Header in rows 7–8, merged:**
  - Hours and inputs: `Name · employee # · Basic Rate per month · STANDARD HOURLY RATE (= monthly ÷ 26 ÷ 8) · TOTAL # OF HRS · Night (hrs) · Regular OT · Regular Holiday · Regular Holiday OT · Special Holiday · Special Holiday OT · Rest Day Sunday · Adjustment · Lates (mins) · Absences · Undertime`.
  - **GROSS PAY:** `Basic, Allowance, De minimis, Night Diff, Regular OT, Regular Holiday, Regular Holiday OT, Special Holiday, Special Holiday OT, Rest Day-Sunday, Reimbursement, Adjustment/Leave Credit, Total`.
  - **DEDUCTIONS:** `Lates, Absences, Undertime, SSS, PHIC, HDMF, SSS Salary Loan, SSS Calamity Loan, HDMF Short-term Loan, HDMF Calamity, Company Loan, Cash Advance, Total Deductions`.
  - Then: `NET PAY · ACCOUNT # · PAYMENT MODE · EMAIL · REMARKS · BIZLINK REFERENCE`.
- **WORKSHEET:** daily time records (IN/OUT/TOTAL HR/OT/HOLIDAY/LEAVE/NS per day) feeding the register. **PAYSLIPS:** per-employee payslips (references the register). **1601-C** (hidden): an old template from another company with `#REF!` errors → skipped.
- **Findings to confirm with you and your accountant.** These are about formulas only; no amounts were read.
  1. **There is no withholding tax on compensation column.** Either all employees are below the taxable threshold, or tax is handled elsewhere. 1601-C needs this (Q19).
  2. **Employer shares (SSS ER/EC, PHIC ER, HDMF ER) are not in the register.** The app will compute them from the rate tables to post the expense and payable correctly.
  3. **PHIC** is computed as monthly basic × 2.5% ÷ 2 per cut-off (the employee half of 5%), which matches the current rate. SSS and HDMF are typed in, so the app will check them against the tables.
  4. **Inconsistent formulas in the first rows** of the register: Regular OT uses `hourly ÷ 8 × 1.25` in some rows but `hourly × 1.25` in others, Holiday OT in one row references the *employee #* column, and Night Diff uses `hourly × 125% × 110%` (the night-shift rate on overtime) for all night hours. These may be harmless (zero hours), but the importer will **recompute and flag** any line where the register's figure differs from the rule.
- **Row key:** cut-off date + employee #. Employees are upserted by employee #.

### 5.3 Live sources

- **Google Sheets.** `files.watch` on each linked spreadsheet → `/api/webhooks/google` → an Inngest `sync.sheet` job (debounced 30 s, so a burst of edits makes one sync). Channels are renewed by a cron job 1 hour before they expire. **Fallback poll** every 2 minutes checks only the file's `version` / `modifiedTime` (cheap) and re-reads the tab only if it changed. *Expect* Google's push to arrive within roughly 1–3 minutes of an edit (Google batches change notifications), so the 5-minute ceiling holds. Seconds-level is not guaranteed for Sheets.
- **Dropbox.** App webhook (with challenge verification) → `files/list_folder/continue` with a stored cursor per watched folder → each new or changed `.xlsx/.xls/.csv` file is hashed (skipped if already imported) → template auto-detect → import, or the review queue.
- **Google Drive folder.** `changes.watch` + page token, then the same flow as Dropbox.
- **Idempotency.** Every job carries an idempotency key (`source_id + file revision/hash`). Retries re-run the same upsert, so they are harmless.
- **Sync health.** Per-source status, last success, last error, and **Retry / Sync now** buttons. After 3 consecutive failures an email alert goes to the Owner (once, until it recovers).

---

## 6. Philippine tax handling (configurable; **to be confirmed by your accountant**)

| Item | Approach |
|---|---|
| VAT 12% | Output on sales, input on VAT-registered purchases. The app reproduces the VAT working at the bottom of your INPUT sheets: **input VAT carry-over**, **3/60 amortisation of input VAT on capital goods**, VAT-exempt sales, VAT payments, and VAT still due. Monthly and quarterly VAT summaries; **2550Q** reference (monthly figures are internal only, since 2550M is no longer required from 2023). |
| EOPT Act (RA 11976, RR 3-2024) | The sales invoice is the primary document for goods **and** services, and the OR is supplementary. Both are stored: `invoice_no` on billings, legacy `OR#` on collections. **VAT basis is set per date range**: *collected* for historic periods (uses 2105 Deferred Output VAT), *billed* from the date you set (default: EOPT effectivity, 04/27/2024). Transitional rules for pre-EOPT receivables of services → the accountant confirms the cut-over date. |
| CWT / BIR 2307 | Expected CWT per client (rate × net of VAT), actual CWT on collection, a **missing-2307 tracker** (collected with CWT but 2307 not received), and file upload of the 2307. |
| EWT we withhold | Off by default. Per-supplier rates (e.g. professional fees, rentals) from editable tables; reports for 0619-E / 1601-EQ and our 2307 issuance list. |
| Payroll | SSS, PhilHealth and Pag-IBIG tables and the withholding tax table on compensation stored with **effective dates** (seeded with the current published tables, flagged "verify"); 1601-C reference; 13th month and de minimis caps editable. |
| Income tax (estimate) | The income-tax working from your INPUT sheets (taxable income to date, prior-year excess credits, CWT and quarterly payments, income tax payable) becomes a **1702Q estimate** report. RCIT rate is configurable (e.g. 20% or 25% depending on net taxable income and total assets). |
| Deadlines | Editable rules table seeded with the usual due dates (1601-C and 0619-E monthly, 2550Q and 1601-EQ quarterly, SSS/PHIC/HDMF monthly) with reminder emails. |
| Summary lists | Sales and purchases summaries in the **same layout as your Excel** (with TIN and address), exportable to Excel. A BIR RELIEF/SLSP data-file export can be added later (Q11). |
| Disclaimer | Shown on the tax pages and insights: *"Informational only; confirm with your accountant / BIR."* |

---

## 7. Screens

**Shell:** sidebar (collapses to a bottom bar on mobile), org name, global period picker (Week / Month / Quarter / Year / Custom + "compare to previous period / same period last year"), "Last synced hh:mm" badge, quick-add (+) button, and a user menu.

1. **Login / Sign-up / 2FA setup / Accept invite**
2. **Dashboard**: cash in bank, sales, collections, expenses, net income, AR, AP, VAT payable (with change vs. comparison period); sales-vs-collections chart; expense breakdown; top clients; overdue billings; bills due this week; insights card.
3. **Clients** (list, detail with billings, payments, aging, notes) · **Suppliers** (same) · **Merge duplicates** tool
4. **Projects / Jobs** (list by CE#/PO#, detail with billings, direct costs and **profit per job**)
5. **Billing** (list with status tabs, new/edit form, invoice PDF, status workflow) · **SOA** per client (PDF)
6. **Collections** (receive payment → pick open billings → partial allowed, CWT, 2307 upload) · **Follow-up list** with notes
7. **Purchases / Bills** (list, form with category lines, photo/PDF attachment) · **Pay bills** · **AP aging**
8. **Bank** (accounts, imported lines, auto-match suggestions, manual match, reconciliation)
9. **Payroll** (runs, register import or entry, posting, remittance tracker) · **Employees**
10. **Accounting**: chart of accounts, journal entries (list + manual entry), general ledger, trial balance, **period close / lock / unlock**
11. **Reports hub**: every report in spec §7 with filters, comparisons, drill-down and PDF/Excel/CSV export · **Scheduled reports**
12. **Tax**: VAT summary, CWT/2307 tracker, EWT, payroll remittances, deadlines calendar
13. **Insights** + **Ask about my finances** chat
14. **Import**: upload (drag and drop) → detect → map → preview → import; **Templates**; **Import log** (per row); **Review queue**
15. **Data sources**: connect Google, Dropbox and Drive; watched folders/sheets; **Sync health**
16. **Settings**: organisation (TIN, RDO, address, logo), users & roles, tax settings and rate tables, document series, categories, email recipients, **Export all data**, audit log viewer, trash (restore)

---

## 8. Insights & AI (design)

- An SQL "facts" layer computes every number (margins, trends, top/bottom clients, expense growth, duplicate-spend candidates, DSO per client, a forecast using each client's actual average days-to-pay, VAT/WHT estimates). The facts are stored in `insights.source_figures`.
- The Claude API receives **only those aggregates** and writes the explanation plus 3–5 action items. The UI shows the source numbers next to each insight.
- **Chat** uses tool calls into fixed read-only functions (`get_pnl(period)`, `compare_periods(a,b)`, `top_clients(period,n)`, `expense_breakdown(period)`, `ar_aging(as_of)`, `client_payment_history(client)`, `cash_forecast(weeks)`, `list_transactions(filters, limit≤50)`). There is no free-form SQL. Answers come in English or Taglish, and the totals in an answer always come from tool results.

---

## 9. Security & reliability

- RLS on every table, plus **automated tests that log in as viewer and as bookkeeper** and confirm forbidden reads/writes fail at the database.
- Secrets only in Vercel/Supabase env vars; `.env.example` lists them. The service-role key is never used in browser code.
- OAuth/Dropbox refresh tokens encrypted (AES-256-GCM). Private storage buckets with short-lived signed URLs.
- Owner 2FA (Supabase TOTP), enforceable per membership.
- Soft delete + trash/restore; the audit log is insert-only.
- Backups: Supabase Pro daily backups **plus** a nightly Inngest job that exports all data (JSON + Excel) to a private bucket (and optionally your Dropbox). "Export all data" button. A restore drill happens in Phase 6.

---

## 10. Questions & assumptions (please answer before Phase 1)

**Q1. BPI BizLink report.** Please upload one "Pay BPI Accounts Report" (.xls) the same way; a single month is enough. Also, do you get full BPI **account statements** (Excel/CSV), and from which channel (BizLink download, BPI online)? Reconciliation needs the full statement, not only the outgoing payment report.

**Q2. System of record.** Which file is the master when they overlap?
  (a) Billings: the **Billing & Collection workbook (C)** covers 2022–2026 and has CE#, PO#, terms and payments, while the **OUTPUT summary (A)** is the 2024 BIR summary. *Recommendation: C is the master; A is imported only to cross-check (it reports matches and differences, and creates nothing).*
  (b) Purchases: the **AP workbook (D)** covers 2022–2026 with payments, CE# and categories, while the **INPUT summary (B)** has the BIR category split and input tax, and probably includes small cash purchases (meals, fuel, parking) that never go through AP. *Recommendation: D is the master for supplier bills and payments; B rows that match a D bill (supplier + ref# + amount) only add the category split, and **B rows with no match become cash/petty-cash purchases**.* Is that how your bookkeeping actually works?

**Q3. CE builder.** Should PA-Quote CEs flow into Projects automatically later (needs PA-Quote to save to the database instead of the browser)? For now I'll accept CE# typed in or imported.

**Q4. Repo layout.** OK to build in `finance/` in this repo (with Vercel's "root directory" set to `finance`) rather than a new repository?

**Q5. Google.** OK to use a **service account** (you share sheets/folders with its email) instead of OAuth, for the reasons in §1? If you have or plan Google Workspace, OAuth "Internal" mode also works.

**Q6. Hosting budget.** OK with Supabase Pro (US$25) + Vercel Pro (US$20) per month? (Free tiers are workable for staging only.)

**Q7. Opening balances.** From which date should the books start (e.g. 01/01/2024)? Will your accountant give a trial balance as of that date (cash, AR, AP, fixed assets, equity)? Without one, the balance sheet will be incomplete.

**Q8. Fiscal year.** Calendar year (Jan–Dec)? *Assumed yes.*

**Q9. Printing supplies.** Expense them as cost of sales (recommended) or carry them as inventory with month-end counts?

**Q10. VAT basis cut-over date.** Your OUTPUT file switches from the collected-basis layout (Jan–Mar 2024) to the billed-basis layout from April 2024. Should the app use "collected" up to 03/31/2024 and "billed" from 04/01/2024, or switch at the EOPT effectivity date (04/27/2024)? Your accountant should confirm.

**Q11. BIR filings.** Is this app for **management books only**, or do you intend it to become your BIR-registered computerized books (that needs a separate BIR application)? Do you need RELIEF/SLSP `.dat` export?

**Q12. Withholding agent status.** Are you a Top Withholding Agent, or do you withhold EWT from any suppliers (rent, professional fees)? This decides whether EWT is on by default.

**Q13. Bank accounts.** List the accounts to set up: BPI current/savings, GCash, Spenmo, petty cash, others? Do you get BPI **statements** (Excel/CSV/PDF) in addition to BizLink "Pay BPI Accounts" reports? Bank reconciliation needs the full statement.

**Q14. Payroll.** About how many employees? Is the register produced by another system (keep importing) or should the app compute payroll from hours? *I assume import plus manual entry, with the app validating the contributions, not computing pay.*

**Q15. Users.** Who needs access on day 1 (names, emails, roles)? Should report emails go to anyone outside the company (your accountant)?

**Q16. Invoice numbering.** What are your current sales invoice / billing statement / OR / CR series (prefixes and ranges)? Should the app **issue** new invoice numbers, or only record numbers from your printed/registered booklets?

**Q17. Staging deploy.** I can't create accounts or log into Supabase, Vercel, Google Cloud, Dropbox, Inngest, Resend or Anthropic for you. In Phase 1 I'll write click-by-click setup steps; you create the accounts and paste the keys into the environment's secrets (or the Vercel dashboard), and then I can deploy and migrate. Until then I'll develop and test against a local Postgres in this environment.

**Q18. Opening date vs history.** Your AP and Billing files go back to 2022. Should the app import **all history from 2022** (more history for insights, but older years need opening balances from 2022), or start the books on **01/01/2024**, with older rows imported only as reference?

**Q19. Payroll withholding tax.** The register has no withholding-tax column. Are all employees currently below the taxable threshold, or is tax computed elsewhere? Should the app compute it from the tax table and show it as a suggestion?

**Q20. Payroll formulas.** I found inconsistent OT, holiday-OT and night-differential formulas in the first rows of the register (details in §5.2-F). Do you want the app to only **flag** differences (my assumption) or to **recompute** pay from hours and replace the register's figures?

**Q21. "Project Offsetting" / "Account Offsetting".** These appear in both AP and collections. Do they mean a client's payable to you was settled by netting against something you owed them (or the reverse)? The app would record them as an AR↔AP offset entry.

**Q22. GCash for Reimbursement / Lalamove wallet / credit card.** Who pays first (employee, owner, or a company card)? This decides whether those post to *Due to Employee*, *Due to Stockholder*, or a *Credit Card Payable* account.

**Assumptions** (tell me if any is wrong): single company (but schema is multi-org ready); PHP only; weeks Mon–Sun; MM/DD/YYYY everywhere; zero-rated/exempt sales are rare but supported; historic data before the opening date is imported for reports and comparisons but posts to an "opening balance" equity cut-off; Taglish free-text remarks are kept as written.

---

## 11. Phase 1 — Foundation: task list (after your OK)

1. Housekeeping: scaffold `finance/` (Next.js App Router, TS strict, Tailwind, shadcn/ui, ESLint/Prettier, Vitest, Playwright); `.env.example`; tidy the stray root files (with your OK).
2. Supabase migrations: tenancy, roles, RLS helpers and policies, audit trigger, period-lock trigger, balanced-entry trigger; all Phase 1 tables (parties, projects, billings, collections, purchases, AP payments, accounts, journals, tax_settings, attachments, audit_log).
3. Auth: email + password, Google sign-in, invite users, roles, Owner TOTP 2FA.
4. Domain library (pure TS + tests): money/VAT maths, date parsing, posting rules, aging buckets, period helpers (Asia/Manila).
5. Default chart of accounts + expense categories + tax settings seed.
6. Clients & suppliers CRUD (TIN validation, terms, VAT status) + duplicate suggestions.
7. Projects (CE#/PO#).
8. Manual entry: billings (with lines), collections (partial, CWT, 2307 upload), purchases (category lines, attachments), AP payments; status workflow; automatic journal posting with reverse-and-repost on edit.
9. Manual journal entries + chart of accounts editor.
10. Dashboard (KPIs, period picker, comparison, charts, overdue, bills due).
11. Synthetic seed: about 12 months of made-up clients (fake TINs), suppliers, jobs, billings, collections with CWT, purchases across all categories, AP payments.
12. Tests: unit (VAT, dates, posting balanced, aging) + RLS role tests + a Playwright smoke test (login → create billing → collect → dashboard updates).
13. README (non-programmer setup) + staging deploy once you've created the accounts (Q17).

**Phase 1 deliverable:** a staging URL where you can log in, add clients, bill, collect, record purchases and see the dashboard and journal update, using synthetic data only.
