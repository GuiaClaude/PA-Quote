# Test Results

Run: `npm test` — Node 22.22, PostgreSQL 16, 2026-10-13. **34 tests, 34 passed, 0 failed.**

Google APIs are replaced by in-memory fakes (`server/test/helpers.js`) that model the Sheets values grid (incl.
formula cells), Drive uploads, and Gmail drafts/sends including rejected, lost-response and timeout failures.
Everything else — SQL, triggers, locks, PDF rendering, exports — runs for real.

| # | Acceptance test (section 24) | Result |
|---|---|---|
| 1 | New Job Order Number appears without duplicates (incl. inserted rows shifting positions) | ✔ |
| 2 | Staff-updated row synchronized with audited before/after diff; duplicate & missing JO numbers flagged | ✔ |
| 3 | Delivered billable project with no invoice flagged; "not yet billable" respected | ✔ |
| 4 | Write-back changes one cell only; row found by JO number after re-sort; concurrent edit & formula cells refused | ✔ |
| 5 | Invoice on several rows counted once (ledger, dashboard, one draft covering both JOs) | ✔ |
| 6 | Partial payments → correct balances; over-allocation refused | ✔ |
| 7 | Unverified claims not counted; maker-checker on verification | ✔ |
| 8 | SOA totals = ledger; aging sums; included refs; review stores PDF in Drive; paid invoices excluded / full history | ✔ |
| 9 | Historical SOA "as recorded" vs "restated"; reproducible content hash | ✔ |
| 10 | Monday scheduler at 08:00 Asia/Manila (00:00 UTC), regardless of host TZ | ✔ |
| 11 | One draft per project per weekly run; repeat = `already_completed`; interrupted run resumes | ✔ |
| 12 | Still drafted after a sent reminder, partial payment and promise; older unsent drafts superseded | ✔ |
| 13 | Marked Paid (after sync) → excluded; stale unsent drafts withdrawn | ✔ |
| 14 | Paid in sheet + ledger balance → critical exception, no draft, SOA cannot be issued | ✔ |
| 15 | No send without approval; sender/approver/sysadmin separation; no self-approval; SOA must be reviewed | ✔ |
| 16 | Edits and balance changes after approval invalidate it; non-Client-Master recipients refused | ✔ |
| 17 | Marked Paid after approval → send blocked and draft cancelled | ✔ |
| 18 | Sync failure / renamed header → run fails, no drafts; retry resumes; failed pre-send sync blocks sending | ✔ |
| 19 | Rejected send → retry; lost response → `send_unknown`, retry blocked, reconciled as sent (1 email); timeout before send → reconciled not sent → single retry | ✔ |
| 20 | Audit entries for all material actions; audit log and financial rows immutable at DB level | ✔ |

Additional: removal/unmatched-client detection, weekly/monthly roll-forward reconciliation and PDF/XLSX/CSV
exports, HTTP auth/CSRF/RBAC, and unit tests for money, dates, parsing, ledger, drafts and approval gate.

## Manual verification
The built UI was run against a sample-data database (`SAMPLE_MODE`) and exercised in headless Chromium on desktop
(1366px) and mobile (390px) widths: dashboard, job orders and detail, unbilled control, ledger, approvals queue and
draft detail, SOA review, settings/column mapping, runs, reports and audit pages rendered without page errors.
The server's startup catch-up correctly detected the missed Monday run and failed closed because no spreadsheet
was configured.

## Not yet verified
* Live Google Sheets/Drive/Gmail calls (no authorized account was available). Validate on staging with a copy of the sheet.
* Gmail's handling of the custom `Message-ID` header (the reconciliation also relies on `X-PA-Send-Key` and draft existence).
