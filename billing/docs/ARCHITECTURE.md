# Architecture & Discovery Notes

## 1. What existed before this work (Phase 1 discovery)

| Item | Finding |
|---|---|
| Repository | `GuiaClaude/PA-Quote` — a **frontend-only** React 18 + Vite 5 "Cost Estimator / CE Builder" (`src/App.jsx`, ~1,500 lines). |
| Persistence | Browser `localStorage` only (saved quotes, CE counters). |
| Backend / database | **None.** |
| Google integrations | **None** in code. |
| Hosting | Not identifiable from the repo (a `dist/` build is committed, suggesting static hosting). |

The estimator is left **untouched**. The billing system is added as a separate, self-contained service in `billing/`
because it needs a server, a database, OAuth secrets and a scheduler — none of which a static site can provide.

### The Job Order List spreadsheet — NOT YET INSPECTED

At build time the Google Sheets, Drive and Gmail connectors available to the build environment were **disconnected**,
so the actual spreadsheet could not be opened. Accordingly:

* **No header names, tab names, status values, client data, bank details or IDs were assumed or invented.**
* Column mapping is configured on **Settings → Spreadsheet & column mapping** after connecting Google. The
  "Inspect spreadsheet" button lists the real tabs (with protected-range and filter counts) and previews the
  first 15 rows so the actual headers can be mapped.
* Status vocabularies ("which value means Paid / Delivered / Cancelled / On Hold / Disputed") are configured
  from the real values used in the sheet. The only default is `Paid` for the paid value, because the business
  rule names it; change it if the sheet uses something else.
* Until the mapping is saved, synchronization fails closed and the Monday run produces **no drafts**.

**Action required (Phase 1 completion):** connect Google, inspect the sheet, and record here:
spreadsheet name/ID, authoritative tab, header row, the Job Order Number format, and the status conventions.

## 2. Architecture

```
               ┌─────────────── browser (React SPA, no secrets) ───────────────┐
               │ dashboard · job orders · ledger · SOAs · approvals · reports │
               └──────────────────────────────┬────────────────────────────────┘
                                              │ HTTPS, session cookie + CSRF header
┌─────────────────────────────────────────────▼──────────────────────────────────────────────┐
│ Node.js 20+ / Express server  (billing/server)                                              │
│  auth+RBAC · sync · ledger · SOA/PDF · email workflow · collection run · reports · audit    │
│  in-process scheduler (croner, Asia/Manila)  or  POST /api/cron/monday from external cron   │
└───────┬───────────────────────────┬─────────────────────────────┬──────────────────────────┘
        │ pg                        │ googleapis (OAuth, server-side refresh token, AES-GCM at rest)
┌───────▼────────┐   ┌──────────────▼──────────┐  ┌───────────────▼─────────┐  ┌─────────────▼────────┐
│ PostgreSQL     │   │ Google Sheets           │  │ Google Drive            │  │ Gmail                 │
│ ledger, audit, │   │ Job Order List (MASTER) │  │ SOA folder (drive.file) │  │ drafts + approved send│
│ approvals, ... │   └─────────────────────────┘  └─────────────────────────┘  └───────────────────────┘
```

| Concern | Choice | Why |
|---|---|---|
| Server | Node 20+, Express 5 | Same language as the existing React app. |
| DB | PostgreSQL 14+ | Relational integrity, triggers for immutability, advisory locks for single-runner jobs. |
| Scheduler | `croner` with IANA zone `Asia/Manila`; catch-up on start; advisory lock | Runs without anyone logged in; never double-runs across instances. |
| PDFs | `pdfkit` | Server-side, deterministic. |
| Excel | `exceljs` | XLSX report export. |
| Frontend | React 18 + Vite 5 (same as estimator) | Built into `web/dist` and served by the same server. |

## 3. Source-of-truth rules (as implemented)

| Data | Authority | Implementation |
|---|---|---|
| Job order existence, project & payment status | **Job Order List sheet** | `job_orders.*_source` columns are mirrors; only sync writes them. Identity = Job Order Number (never the row number). |
| Writes to the sheet | Explicit, approved, per-cell | `sheet_writebacks`: field must be mapped **and** enabled; approver ≠ requester; row located by JO number; live cell re-read; abort on formula or changed value. |
| Invoices | Ledger (`invoices`), one row per invoice number | Sheet-derived invoices start `unreconciled` and are excluded from SOAs until staff confirm them. Reconciled invoices are never overwritten by the sheet — differences raise `invoice_source_mismatch`. |
| Payments | Ledger | `claimed → verified` (maker-checker). Only verified + allocated payments reduce balances. Reversals, never deletes. |
| Client contacts | Client Master | Sheet client names link only via explicit aliases. Email recipients must be Client Master addresses. |
| Permission to send | `approvals` table | Spreadsheet status never authorizes sending. |
| Conflicts | `exceptions` table | Flagged, never silently resolved. |

## 4. Key safety mechanisms

* **Fail closed on sync:** missing config, read errors, header changes, or mapped headers not found → run marked failed; Monday run stops before drafts; UI shows "payment status may not be current".
* **Approval binding:** SHA-256 over recipients, subject, body, SOA id + PDF hash and amounts. Any edit → new version, approvals invalidated.
* **Pre-send revalidation:** fresh sync → block if now Paid (draft cancelled), require re-approval if balance or status changed.
* **Duplicate-safe sending:** one in-flight attempt per draft (unique index); a unique `X-PA-Send-Key` header per attempt; uncertain outcomes become `send_unknown` and must be reconciled (search SENT for the key / check if the Gmail draft still exists / manual confirmation) before any retry.
* **Immutability:** DB triggers forbid UPDATE/DELETE on `audit_log`, DELETE on financial tables, and amount edits on payments/allocations/adjustments.
* **Segregation of duties:** generator ≠ SOA reviewer; author/editor ≠ email approver (configurable, audited exception); recorder ≠ payment verifier; adjustment requester ≠ approver; sysadmin has no approve/send rights by default.

## 5. Integration status

| Integration | Code | Status in this deployment |
|---|---|---|
| Google OAuth | Implemented | **Requires** Google Cloud OAuth client + `APP_ENCRYPTION_KEY`, then "Connect Google account". |
| Sheets read/sync | Implemented & tested against fakes | **Requires authorization + column mapping.** |
| Sheets write-back | Implemented & tested against fakes | Off until fields are enabled in mapping. |
| Drive SOA storage | Implemented | Requires a folder (Settings → Create folder; `drive.file` scope only sees app-created files). |
| Gmail drafts/send | Implemented & tested against fakes | Requires authorization. Bounce detection is not automated (Gmail API exposes no delivery status); bounces arrive as normal mail. |
| Internal reviewer emails | Implemented | Optional (Policies → reviewer emails). |

Tests use in-memory fakes of the three Google APIs; the real adapters (`server/google/index.js`) have **not** been
exercised against live Google services in this environment. Validate them on staging with a copy of the sheet.

## 6. Recommended changes to confirm

1. Hosting: a small VM/container (Cloud Run with min-instances=1, or Render/Railway/Fly) + managed PostgreSQL. If the
   host scales to zero, set `ENABLE_INTERNAL_SCHEDULER=false` and use Cloud Scheduler → `POST /api/cron/monday`.
2. Use a dedicated Google Workspace account (e.g. billing@…) for the integration so emails come from a shared mailbox.
3. Point the app at a **copy** of the Job Order List first, validate mappings and write-back, then switch to the live file.
