# Print Amplified Client Ordering App — Phase 0 Plan

Status: **draft for review**. No app code has been written yet. Everything below can change based on your answers to Section 1.

---

## 1. Questions for you (please answer before Phase 1)

Each question has a recommended default. You can reply "use the defaults" for any of them.

### A. Blocking setup decisions

1. **Where should the new app live in this repo?**
   This repo is not empty. It holds the old *PrintAmplified Cost Estimator* (Vite, `App.jsx`) and the BNI Elite CAS static pages under `public/`, and its current Vercel deployment forwards old addresses to `bni-elite-cas-marketing.vercel.app`.
   **Recommended:** build the new app in a `portal/` folder and deploy it as a **new Vercel project** (Root Directory = `portal`). Nothing that is live today changes. I will reuse the brand colors (teal `#3BBFC8` / `#00AEBF`, magenta `#E0295A`), the hexagon logo and the press list (Komori, Kord, MO, Sord, Eneo) from the old estimator.
2. **Paid tiers are needed for this app to run as a business tool.** Here is why:
   - The **Supabase Free** plan caps uploads at **50 MB per file** (you asked for 100 MB), has **no daily backups**, and **pauses the database after 7 days without activity**. **Supabase Pro costs about US$25/month** and fixes all three.
   - **Vercel Hobby** (free) is for **non-commercial use only**. **Vercel Pro costs about US$20/month per member** and also gives longer function run times, which the preview generator needs.
   - **Resend Free** (3,000 emails/month, 100/day) is enough to start.
   - **Cloudflare Turnstile** is free.
   - **Total: about US$45/month (around ₱2,600).**
   **Recommended:** approve Supabase Pro and Vercel Pro for launch. I can build and test locally on free tools until Phase 7.
3. **Accounts I cannot create for you.** By Phase 7 Print Amplified will need to own: a Supabase project, a Vercel team, a Resend account (with DNS access to `printamplified.com` so emails come from e.g. `orders@printamplified.com`) and a Cloudflare account for Turnstile.
   Which web address do you want? **Recommended:** `order.printamplified.com`.
4. **AI auto-fill of past estimates (Claude API, paid per use).** **Recommended:** I build it in Phase 5 behind a switch that is **off by default**. Before you turn it on, I will show you the expected cost per estimate. Nothing extracted is used until staff confirm it.

### B. Business rules I need to get right

5. **One-time charges on reorders** (plates, dies, setup, layout): when a client reorders an item, are these charged again?
   **Recommended:** each one-time charge on an estimate has a checkbox, "charge again on reorder", which is off for dies and on for plates by default. Staff can change it per estimate.
6. **VAT:** is Print Amplified VAT-registered at 12%? Should quotes show the VAT-exclusive price + VAT + total?
   **Recommended:** yes, 12%, shown as three lines.
7. **Order numbers:** `PA-2026-000123`. Should the counter restart every January (`PA-2027-000001`) or keep counting up?
   **Recommended:** restart each year.
8. **Rounding default:** the instant price rounds up per piece or per order total, to ₱1, ₱5 or ₱10?
   **Recommended:** round the **order total** up to the nearest **₱5**. Unit prices are shown to 2 decimals.
9. **Cancelling orders:** **Recommended:** clients can cancel on their own until the order is **Confirmed**. After that they tap "Request cancellation" and staff decide.
10. **Who approves outside-domain invites** (for example, a client admin inviting a Gmail address)? **Recommended:** the client's assigned `pa_sales` **or** any `pa_admin`.
11. **Lead times:** should each catalog product have a default lead time (for example "5–7 working days") that is shown on instant quotes?
    **Recommended:** yes. Staff can override it per quote.
12. **Should `pa_production` see the client company name and the delivery address?** **Recommended:** yes, because they need both to pack and deliver. They never see prices or payments.
13. **Real content:** do you have the final logo files, bank account details, cheque payee name, TIN and a sales-team contact list? If not, I will use clearly marked placeholders that staff can replace in Settings.
14. **Inflation table:** I will pre-fill PSA headline inflation as a "please confirm" suggestion: 2021 3.9%, 2022 5.8%, 2023 6.0%, 2024 3.2%, 2025 ~1.7%, and 2026 left for management to enter. Management must verify these numbers before going live.

---

## 2. Key technical decisions (plain language)

| Decision | Why |
|---|---|
| **Next.js 16 (App Router) + TypeScript strict, React 19, Tailwind v4, shadcn/ui** | This is the stack you asked for, at the current stable versions. |
| **Large files upload straight from the phone or browser to Supabase Storage**, using a one-time signed upload link | Vercel functions only accept about 4.5 MB per request. Sending files directly lets the 100 MB limit work. The server then checks the file, records its SHA-256 checksum and makes the preview. |
| **Our own invitation system** (`invitations` table, hashed single-use token, 7-day expiry) instead of Supabase's built-in invite email | Supabase's built-in invite links expire within 24 hours, and you need 7 days, resend, cancel and the domain-approval rules. |
| **Login runs through our server** (Server Action) | This lets us count failed attempts per account, lock the account temporarily, check Turnstile, record "new device" logins and write the audit log. |
| **Two-factor authentication: Supabase TOTP (authenticator app)** | Required for staff and `client_admin`. This is enforced in the database too (RLS checks the session's assurance level), not only in the UI. |
| **Session rules enforced in middleware** (installed app: 30 days, web: 12 hours of inactivity, both editable) | Supabase only offers project-wide session limits. Ours can tell an installed app apart from a browser. |
| **Previews generated server-side**: `mupdf` (WASM) for PDF/AI and `sharp` for JPG/PNG/TIFF. Output is about 1,200 px JPG with a watermark | High-res files never leave the private bucket for client roles. |
| **Two storage buckets:** `print-files` (staff only) and `previews` (staff + own organization via RLS, served only as short-lived signed URLs). Plus `attachments` (revision attachments, payment slips) and `brand` (logo, fonts) | This makes it structurally impossible for a client to fetch a high-res file. |
| **Money:** order and quote totals stored as **integer centavos** (`bigint`), unit prices as `numeric(14,4)`, and all calculations done in code with **decimal.js** | No floating-point rounding errors. |
| **Spec matching uses a `spec_signature`** (SHA-256 of the normalized spec fields) | Instant quotes compare exact specs, not free text. |
| **Local development uses the Supabase CLI + Docker** (both are available in this environment) | RLS tests run against a real Postgres + Auth, with no cloud account needed until Phase 7. |
| **PWA via Serwist** (`@serwist/next`) | The maintained successor to next-pwa: manifest, service worker, offline page and web push. |
| **All UI text in `src/i18n/en.ts`** | Filipino/Taglish can be added later as `fil.ts`. |

New dependencies beyond the ones you named: `decimal.js` (money), `@serwist/next` (PWA), `mupdf` (PDF render), `sharp`, `exceljs` (Excel import/export), `papaparse` (CSV), `web-push` (push notifications), `date-fns-tz` (Manila time). All are free and open source.

---

## 3. Data model

Conventions:
- Every table has a `uuid` primary key and `created_at` / `updated_at`.
- Business records also have `deleted_at` (soft delete).
- Every client-owned row carries `organization_id`, which is what RLS checks.
- Approved artwork versions and files can never be hard-deleted. This is enforced by a trigger, not just the UI.

### 3.1 People, companies, access

| Table | Key columns | Notes |
|---|---|---|
| `organizations` | name, slug, billing_name, tin, credit_terms (text), logo_path, allow_instant_quotes (bool, default true), allow_highres_download (bool, default false, pa_admin only), client_discount_pct, client_adjustment_cap_pct, status | A client company |
| `organization_domains` | organization_id, domain (`abccorp.com.ph`) | Approved email domains |
| `profiles` | id (= auth user), full_name, email, phone, viber, staff_role (`pa_admin`/`pa_sales`/`pa_production`/null), is_active, last_login_at, mfa_required | One row per user |
| `memberships` | profile_id, organization_id, client_role (`client_admin`/`client_buyer`/`client_viewer`), is_active | **Ready for one person in several companies later.** v1 enforces one active membership per client user. |
| `staff_assignments` | organization_id, staff_profile_id, is_primary | The account manager shown on the client dashboard |
| `invitations` | organization_id (null for staff), email, role, token_hash, invited_by, status (`pending`/`needs_approval`/`accepted`/`cancelled`/`expired`), expires_at, approved_by | Single-use, 7 days |
| `auth_events` | profile_id/email, kind (`login_ok`/`login_fail`/`lockout`/`new_device`/`logout_all`), ip, user_agent, device_id | Lockout counting + "new device" emails |
| `known_devices` | profile_id, device_id_hash, first_seen, last_seen, is_installed_app | |
| `addresses` | organization_id, label, recipient, phone, line1, line2, barangay, city, province, zip, is_default | Delivery addresses |

### 3.2 Catalog and new-order quotes

| Table | Key columns | Notes |
|---|---|---|
| `product_categories` | name, sort, photo_path | |
| `products` | category_id, name, description, photos[], default_lead_time_text, visibility (`all`/`selected`), is_active | |
| `product_visibility` | product_id, organization_id | Used when visibility = `selected` |
| `product_options` | product_id, kind (`size`/`material`/`colors`/`finishing`/`packaging`), label, value_json, sort | Spec form choices |
| `standard_prices` | product_id, spec_signature, spec_json, quantity, unit_price, total_centavos, vat_inclusive, valid_until | Instant price for common specs |
| `quote_requests` | organization_id, number, product_id / print_item_id, spec_json, quantity_list, artwork files/links, needs_design_help, delivery date/address, status (`draft`/`submitted`/`quoted`/`accepted`/`declined`/`expired`/`cancelled`), needs_quote_reasons[], submitted_by | Also used for "Needs Quote" reorders |
| `quotes` | quote_request_id, revision_no, lead_time_text, valid_until, notes, status (`sent`/`accepted`/`declined`/`superseded`/`expired`), sent_by, accepted_by/at/ip | Staff reply |
| `quote_tiers` | quote_id, quantity, unit_price, total_centavos, vat_inclusive | |
| `quote_messages` | quote_request_id, author_id, body | "Ask a question" thread |
| `draft_orders` | organization_id, created_by, payload_json, kind (`new`/`reorder`) | Saved drafts and the reorder cart |

### 3.3 Print Items, files, previews

| Table | Key columns | Notes |
|---|---|---|
| `print_items` | organization_id, code, name, category_id, product_id, tags[], spec_json, **spec_signature**, approved_version_id, color_standard_id, source_order_id, thumbnail_rendition_id | The master record |
| `artwork_versions` | print_item_id, version_no, change_notes, uploaded_by, status (`draft`/`proof`/`approved`/`superseded`), approved_at, **is_locked** | Only one `approved` per item (partial unique index). Locked rows can't be updated or deleted (trigger). |
| `files` | organization_id, artwork_version_id (or owner type/id), kind (`upload`/`drive_link`), bucket, storage_path, external_url, label, mime, size_bytes, **sha256**, original_name, copied_to_archive_at/by | Drive-link-only versions show the warning |
| `preview_renditions` | file_id, page_no, side (`front`/`back`/null), preview_path, width, height, source (`auto`/`manual`), status (`pending`/`ready`/`failed`/`unsupported`) | Low-res watermarked JPGs |
| `color_standards` | print_item_id, pantone_refs[], cmyk_targets_json, paper_stock, press_machine, notes, approved_by, approved_at | |
| `color_standard_photos` | color_standard_id, file_id, caption | Press-sheet photos/scans (these go through previews too) |
| `fonts` | family, style, weight, storage_path, uploaded_by | For editable templates |
| `editable_templates` | print_item_id, artwork_version_id, background_rendition_id | One per item version/side |
| `template_fields` | template_id, page_no, key, label, default_text, x_pct, y_pct, w_pct, h_pct, font_id, size_pt, color_hex, align, max_chars, sort | Positions stored as % of the preview |

### 3.4 Revisions and approval

| Table | Key columns | Notes |
|---|---|---|
| `revision_requests` | organization_id, print_item_id, order_id, base_version_id, round_no, status (`open`/`in_prepress`/`proof_sent`/`approved`/`cancelled`), general_notes, submitted_by, result_version_id | |
| `revision_markups` | revision_request_id, rendition_id, page_no, shape (`pin`/`box`), x_pct, y_pct, w_pct, h_pct, comment, staff_reply, staff_status (`open`/`done`/`question`) | |
| `revision_attachments` | revision_request_id, markup_id (nullable), file_id | |
| `template_field_values` | revision_request_id, template_field_id, value | |
| `approvals` | organization_id, artwork_version_id, revision_request_id, order_id, approved_by, approved_at, ip, user_agent | Permanent record |

### 3.5 Pricing, past estimates, instant quotes

| Table | Key columns | Notes |
|---|---|---|
| `past_estimates` | organization_id, print_item_id, estimate_no, estimate_date, vat_inclusive, valid_until, notes, status (`draft`/`confirmed`), extracted_by (`staff`/`ai`), confirmed_by/at, original_file_id | The original file stays staff-only |
| `past_estimate_lines` | past_estimate_id, spec_json, spec_signature, quantity, unit_price, total_centavos | Quantity tiers |
| `past_estimate_charges` | past_estimate_id, label, amount_centavos, recharge_on_reorder | Plates/dies/setup… (see Question 5) |
| `price_tiers` | organization_id, print_item_id, quantity, unit_price, total_centavos, vat_inclusive, source (`estimate`/`quote`/`order`/`manual`), source_ref, base_date, valid_until, is_current | The agreed price |
| `price_history` | price_tier_id, old/new values, changed_by, changed_at, reason | Written by a trigger |
| `inflation_rates` | year, rate_pct, effective_from, needs_confirmation, set_by | History kept by new rows; never overwritten |
| `category_surcharges` | category_id or material_key, pct, effective_from, effective_to | |
| `fixed_addons` | scope (`order`/`category`), category_id, label, amount_centavos, effective_from/to | |
| `pricing_settings` | **version_no**, rounding_step (1/5/10), rounding_scope, vat_rate_pct, quote_validity_days, max_estimate_age_years, max_adjustment_pct, show_breakdown_to_clients, effective_from, created_by | Versioned: each change inserts a new row |
| `instant_quotes` | organization_id, print_item_id, quantity, base_price_tier_id / past_estimate_line_id, base_unit_price, base_date, inflation_factor, inflation_detail_json, surcharge_pct, addons_centavos, client_adjustment_pct, pricing_settings_version, pre_round_total, final_total_centavos, vat_mode, valid_until, status (`offered`/`accepted`/`expired`/`overridden`/`blocked`), block_reasons[], override_by/reason/old_total | Every input is stored, so any quote can be explained later |

Formula (to be unit-tested):
`instant = max(base, base × Π(1+rᵧ)^(fractionᵧ) × (1+surcharge) × (1+client_adj)) + add-ons → round up`
Here `fractionᵧ` is the share of each calendar year between the estimate date and today (prorated by days), and VAT is normalized to VAT-exclusive before the adjustment.

### 3.6 Orders, tracking, payments, system

| Table | Key columns | Notes |
|---|---|---|
| `orders` | organization_id, **order_no** (`PA-2026-000123`, via a per-year sequence table), kind (`new`/`reorder`), status, client_po_no, delivery_address_snapshot_json, requested_date, subtotal/vat/total_centavos, payment_status (`unpaid`/`partially_paid`/`paid`), placed_by, confirmed_by/at, quote_id / instant_quote_id | |
| `order_items` | order_id, print_item_id, quantity, **spec_snapshot_json, unit_price, total_centavos, artwork_version_id, color_standard_snapshot_json**, notes | Snapshots: later edits never rewrite history |
| `order_status_events` | order_id, from_status, to_status, note, actor_id, created_at, client_visible | |
| `order_attachments` | order_id, status_event_id, kind (`production_photo`/`delivery_photo`/`delivery_receipt`), file_id | |
| `payments` | order_id, method (`bank_transfer`/`cheque`), reference_no, bank, amount_centavos, received_on, notes, recorded_by | Status rolls up to the order |
| `payment_slips` | order_id, file_id, uploaded_by | Optional photo uploaded by the client |
| `order_number_counters` | year, last_value | |
| `notifications` | profile_id, kind, title, body, link, read_at | In-app inbox (also the base for later reminders and announcements) |
| `push_subscriptions` | profile_id, endpoint, keys_json | Web push |
| `settings` | key, value_json, updated_by | Company info, payment instructions, brand colors, email sender, session timeouts |
| `audit_logs` | actor_id, organization_id, action, entity_type, entity_id, ip, user_agent, meta_json, created_at | Append-only (no update/delete for anyone, enforced by trigger + RLS) |

**Room for later phases (not created now):**
- `proofs` / `proof_rounds` can reuse the `artwork_versions` + `revision_requests` pattern.
- `support_tickets` can attach to `organization_id` + `print_item_id`/`order_id`.
- `announcements` can reuse the visibility model of `products`.
- `reorder_schedules` attach to `print_items` (the order history already has the dates).
- Reports read from `orders` / `order_items` snapshots.
- Online payments add a `payment_intents` table beside `payments`.

### 3.7 Security rules (RLS)

- Helper functions (security definer): `is_staff()`, `staff_role()`, `my_org_ids()`, `my_client_role(org)`, `is_assigned(org)` (for `pa_sales`), `aal2_ok()` (2FA satisfied when required).
- Client roles: they can read only rows whose `organization_id ∈ my_org_ids()`. Price columns live in separate tables (`price_tiers`, `quote_tiers`, `instant_quotes`, `payments`, totals in `orders`), so `client_viewer` and `pa_production` are blocked at the table level. Order totals are exposed to clients through a view filtered by role.
- `pa_sales`: full access for assigned organizations only. `pa_admin`: all organizations. `pa_production`: orders/items/status events, but no price or payment tables.
- Storage: `print-files` gives staff read only (clients never; a high-res download, where allowed, is a server-issued signed URL after checking `allow_highres_download` and audit logging). `previews` and `attachments` use an object path prefix `org/<organization_id>/…`, checked against `my_org_ids()`.
- **RLS test suite:** for every table and bucket, a Client A user gets **0 rows / denied** on Client B's data through the API with their own token. This covers guessed UUIDs, previews, estimates, quotes and prices, plus "viewer can't see prices" and "production can't see payments".

---

## 4. Page map

Client screens use a **bottom navigation bar on phones**: Home · Order · My Orders · My Items · Account. On desktop it becomes a left sidebar.

### Public (signed out)

- `/login`: sign in with password or magic link, Turnstile. No sign-up.
- `/login/mfa`: authenticator code / enrolment.
- `/forgot-password`, `/reset-password`
- `/invite/[token]`: accept the invite and set a password.
- `/privacy`: Data Privacy Act notice. `/offline`: PWA offline page.

### Client (`/app/...`)

- `/app`: **Ordering home**: Reorder / New Order / Track My Orders, quick reorder cards, active orders, account manager card.
- `/app/order/new`: catalog by category. `/app/order/new/[productId]`: guided spec form → instant price or quote request.
- `/app/order/reorder`: pick items to reorder. `/app/cart`: reorder cart and "Same as last order".
- `/app/drafts`: saved drafts.
- `/app/quotes` and `/app/quotes/[id]`: quote detail with Accept / Decline / Ask a question (also instant quotes).
- `/app/orders` and `/app/orders/[id]`: status timeline, total, payment instructions and status, upload a payment slip.
- `/app/items`: My Print Items grid (search, filters).
  - `/app/items/[id]`: specs, preview viewer, color standard, price tiers, history, **Reorder**.
  - `/app/items/[id]/review`: Review Artwork → Confirm / I have revisions (markups + editable fields).
  - `/app/revisions/[id]`: revision round, compare slider, Approve.
- `/app/notifications`
- `/app/account`: profile, password, 2FA, log out of all devices.
- `/app/account/team`: client_admin only (invite users, roles, deactivate).

### Staff (`/staff/...`)

Desktop has a left sidebar with grouped navigation and a top bar with global search and notifications. On phones the sidebar becomes a drawer.

- `/staff`: **Dashboard**: KPI cards (new orders, quotes waiting with target reply time, quotes not accepted, Needs Quote with reasons, unpaid, instant quotes today), a work queue and orders by status.
- `/staff/orders` and `/staff/orders/[id]`: confirm, adjust price, status updates with photos, delivery receipt, payments.
- `/staff/quotes` and `/staff/quotes/[id]`: reply / revise; filter by accepted / declined / expired; Needs Quote prefilled.
- `/staff/revisions` and `/staff/revisions/[id]`: prepress queue, markups on the preview, replies, upload a revised proof.
- `/staff/clients`: list and create a client.
  - `/staff/clients/[id]`: overview, domains, users and invites, addresses, account manager, settings (instant quotes, high-res download, discount).
  - `/staff/clients/[id]/items`: the client's Print Items.
  - `/staff/items/[id]`: specs, versions, files and Drive links, approve, color standard, previews, prices.
  - `/staff/items/[id]/template`: editable-fields designer.
- `/staff/estimates` and `/staff/estimates/new`, `/staff/estimates/[id]`: upload, confirm form, AI auto-fill. `/staff/estimates/import`: bulk import.
- `/staff/pricing/preview`: quote preview tool.
- `/staff/catalog`: categories, products, options, standard prices, visibility.
- `/staff/import`: CSV import for clients and Print Items + bulk file upload.
- `/staff/staff-users`: pa_admin only.
- `/staff/settings`: company, payment instructions, branding, email, sessions, **pricing rules** (pa_admin only): inflation table, surcharges, add-ons, rounding, VAT, validity, limits, breakdown visibility.
- `/staff/audit`: audit log (filter, export).

---

## 5. Dashboard UI/UX standards I will follow

- **Design system:** shadcn/ui on Radix primitives. One `theme.css` with design tokens (brand, surface, text, border, status colours), with brand colours overridable from Settings. An 8-pt spacing scale and the Inter font (self-hosted). Light theme first, dark-mode-ready tokens.
- **Navigation patterns:**
  - Staff: a collapsible left sidebar grouped as *Work* (Dashboard, Orders, Quotes, Revisions), *Clients* (Clients, Print Items, Estimates), *Catalog & Pricing* and *Admin*. A top bar with global search (⌘K), notifications and profile. Breadcrumbs on detail pages.
  - Clients: a bottom tab bar on phones (thumb-reachable, 48 px+ targets) and a sidebar on desktop.
- **Dashboard layout:** KPI cards at the top (value, label, trend or "oldest waiting" hint; each card links to its filtered list), then "My work queue" (actionable items sorted by urgency with SLA badges), then status breakdowns. Above-the-fold content answers "what needs me now?".
- **Data tables:** sticky header, column sort, filter chips, saved filters in the URL, server-side pagination (25/50/100), row click to open the detail page, bulk actions where useful. They turn into cards on phones.
- **Status system:** one colour + icon + label per status, used consistently across lists, timelines and badges, so the meaning never relies on colour alone.
- **Forms:** single-column, grouped sections, inline Zod validation, sensible defaults, autosave for drafts, a sticky primary action on mobile, and ₱ formatting with tabular numerals.
- **Feedback:** skeleton loaders, optimistic updates where safe, toasts for success, confirm dialogs that name the object being deleted ("Deactivate Maria Santos?"), undo where possible, and helpful empty states with a primary action.
- **Accessibility:** WCAG 2.2 AA contrast, full keyboard navigation, visible focus rings, labelled inputs, `aria-live` for status updates and reduced-motion support.
- **Performance:** Server Components by default, lazy-loaded thumbnails, paginated lists, and a target of LCP < 2.5 s on a mid-range phone over 4G.

---

## 6. Files I will create (by phase)

```
portal/
  package.json, tsconfig.json (strict), next.config.ts, postcss.config.mjs,
  components.json (shadcn), vitest.config.ts, playwright.config.ts,
  .env.example, README.md (owner's guide), middleware.ts
  supabase/
    config.toml
    migrations/
      0001_extensions_and_helpers.sql      -- uuid, citext, updated_at + soft-delete triggers, role helpers
      0002_orgs_profiles_access.sql        -- organizations, domains, profiles, memberships, staff_assignments, invitations, auth_events, devices, addresses
      0003_settings_audit.sql              -- settings, audit_logs (append-only), notifications, push_subscriptions
      0004_catalog_quotes.sql              -- categories, products, options, standard_prices, quote_requests, quotes, tiers, messages, drafts
      0005_print_items_files.sql           -- print_items, artwork_versions (lock trigger), files, preview_renditions, color_standards, fonts, templates
      0006_revisions_approvals.sql
      0007_pricing_estimates.sql           -- past_estimates*, price_tiers, price_history, inflation, surcharges, addons, pricing_settings, instant_quotes
      0008_orders_payments.sql             -- orders, items, status events, attachments, payments, slips, order numbers
      0009_rls_policies.sql                -- every table
      0010_storage_buckets_policies.sql
    seed/ seed.ts (+ demo files: sample PDFs, JPGs, fonts)
  scripts/
    export-client.ts       -- export all data + files for one client (ZIP)
    gen-icons.ts           -- PWA icons/splash from the logo
  public/ manifest.webmanifest, icons/, splash/
  src/
    app/
      (public)/login, login/mfa, forgot-password, reset-password, invite/[token], privacy, offline
      app/...              -- client routes (Section 4)
      staff/...            -- staff routes (Section 4)
      api/previews/render/route.ts, api/files/signed-url/route.ts, api/push/route.ts, api/cron/*.ts
      sw.ts                -- Serwist service worker
      layout.tsx, globals.css
    components/
      ui/                  -- shadcn components
      layout/              -- ClientShell (bottom nav), StaffShell (sidebar), PageHeader, EmptyState
      data/                -- DataTable, KpiCard, StatusBadge, Timeline, Money
      preview/             -- PreviewViewer (zoom/pages/sides, no-drag), CompareSlider, MarkupLayer, TemplateCanvas
      forms/               -- SpecForm, AddressForm, FileUploader (direct-to-storage + sha256), DriveLinkInput
    lib/
      supabase/ (server.ts, browser.ts, admin.ts — admin is server-only)
      auth/ (roles.ts, guards.ts, lockout.ts, devices.ts, mfa.ts, session-policy.ts)
      pricing/ (instant-quote.ts, inflation.ts, rounding.ts, vat.ts, rules.ts, spec-signature.ts)
      money.ts, dates.ts (Asia/Manila), order-number.ts
      files/ (checksum.ts, render-preview.ts, watermark.ts, mime.ts)
      email/ (resend.ts, templates/*)
      notifications/ (notify.ts, push.ts)
      audit.ts, validation/ (zod schemas per domain)
    i18n/ en.ts, index.ts
    theme/ tokens.ts (brand colours, overridable from Settings)
  tests/
    unit/ pricing/*.test.ts, spec-signature.test.ts, money.test.ts, order-number.test.ts
    rls/ tables.test.ts, storage.test.ts, guessed-ids.test.ts, roles-prices.test.ts
    e2e/ login.spec.ts, reorder.spec.ts, new-order-quote.spec.ts, revision-loop.spec.ts, tracking-payment.spec.ts (mobile + desktop projects)
docs/
  PHASE-0-PLAN.md (this file)
```

---

## 7. Seed data (Phase 1, expanded per phase)

- **Catalog:** 4 categories (Marketing Collateral, Stationery, Labels & Stickers, Packaging) with about 10 products.
- **Clients:** 2 demo companies (*ABC Corporation*, *Sunrise Foods Inc.*), each with domains, addresses and an account manager.
- **Users:** one demo user per role (`admin@`, `sales@`, `production@`, plus `client_admin`, `client_buyer` and `client_viewer` at each company). The password is in the README for local use only.
- **Print Items:** about 8, including 2 with editable fields, 1 with an open revision request with markups, and a mix of uploaded files and Drive links only.
- **Past estimates:** recent ones, one older than 3 years, and one VAT-exclusive.
- **Pricing:** an inflation table marked "please confirm", surcharges and price tiers.
- **Activity:** quote requests and quotes in every state, and orders across statuses and payment states.

---

## 8. Phase checkpoints (unchanged from your brief)

0 Plan → 1 Foundation → 2 File archive → 3 Review & revise → 4 Catalog/new orders/quotes → 5 Estimates/instant quotes/reorder → 6 Tracking/payments → 7 PWA/launch.

I will stop for your review after each phase and commit after each working step.
