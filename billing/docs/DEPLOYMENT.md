# Deployment

## Requirements
* Node.js 20+ (tested on 22)
* PostgreSQL 14+ (tested on 16)
* A Google Workspace account for the integration, and a Google Cloud project you control

## 1. Google Cloud setup
1. Create/choose a Google Cloud project. Enable **Google Sheets API**, **Google Drive API**, **Gmail API**.
2. *OAuth consent screen*: Internal (Workspace) is preferred. Add scopes:
   `openid`, `email`, `…/auth/spreadsheets`, `…/auth/drive.file`, `…/auth/gmail.compose`, `…/auth/gmail.metadata`.
3. *Credentials → Create OAuth client ID → Web application.* Authorized redirect URI:
   `https://<your-host>/api/google/oauth/callback`. Copy the client ID/secret into the environment.
4. The connecting account must have **edit** access to the Job Order List (edit is needed only for write-back).

## 2. Configure & start
```bash
cd billing
cp .env.example .env            # fill in values; keep .env out of git
npm ci
npm run build                   # builds the web UI into web/dist
set -a; . ./.env; set +a
npm run migrate                 # creates/updates the schema
npm run user:create -- --email admin@yourco --name "Admin" --roles sysadmin
npm run user:create -- --email ar@yourco --name "AR Staff" --roles accounting
npm run user:create -- --email approver@yourco --name "Finance Approver" --roles approver,management
npm run user:create -- --email sender@yourco --name "Sender" --roles sender
npm start
```
Passwords are prompted (or read from `PA_NEW_PASSWORD`). Run behind HTTPS (reverse proxy or platform TLS).

## 3. First-time configuration (as sysadmin)
1. **Settings → Connections → Connect Google account**, approve all requested scopes.
2. **Settings → Spreadsheet & column mapping**: paste the spreadsheet ID, *Inspect*, pick the authoritative tab and
   header row, map columns, enter status values exactly as used in the sheet, enable write-back fields (optional), *Save & sync now*.
3. **Connections → Create folder** for SOAs (or the app cannot store statements).
4. **Company & payment instructions**: enter approved company details and payment instructions.
5. **Clients**: create Client Master records and add sheet-name aliases; resolve `unmatched_client` exceptions.
6. **Invoices & Payments → Invoices → Awaiting reconciliation**: confirm each sheet-derived invoice.
7. **Connections → Test connections.**

## 4. Scheduling
* Default: in-process scheduler (`ENABLE_INTERNAL_SCHEDULER=true`) — Monday 08:00 **Asia/Manila** collection run,
  periodic sheet sync (`policy.syncCron`), daily/weekly/monthly report snapshots, stale-send detection. If the server
  starts after a missed Monday run, it runs a catch-up. A PostgreSQL advisory lock prevents concurrent runs.
* Hosts that scale to zero: set `ENABLE_INTERNAL_SCHEDULER=false` and create an external job, e.g. Cloud Scheduler
  `0 8 * * 1`, time zone `Asia/Manila`, `POST https://<host>/api/cron/monday` with header `x-cron-secret: $CRON_SECRET`.
  Or run `npm run collection:run` from any cron. Runs are idempotent per week — retries resume, never duplicate.

## 5. Backups & recovery
* PostgreSQL holds the ledger, approvals and audit trail — **back it up**: managed daily snapshots + PITR, or
  `pg_dump -Fc $DATABASE_URL > pa_billing_$(date +%F).dump` nightly, retained ≥ 90 days, copied off-host.
* Restore: `pg_restore -d <new-db> --clean pa_billing_YYYY-MM-DD.dump`, then `npm run migrate`.
* Test a restore quarterly. Statements are also stored as PDFs in Drive; the sheet stays the master for job orders.
* Rotating `APP_ENCRYPTION_KEY` invalidates the stored Google token: reconnect Google after rotating.

## 6. Tests
```bash
createdb pa_billing_test
TEST_DATABASE_URL=postgres://…/pa_billing_test npm test
```
The test suite drops and recreates the `public` schema of the **test** database — never point it at production.

## 7. Demo / training environment
Use a separate database: `ALLOW_SAMPLE_DATA=true PA_SAMPLE_PASSWORD=… npm run seed:sample`, run with `SAMPLE_MODE=true`.
The seeder refuses to run on a database that contains live records, and every sample record is flagged and labelled `[SAMPLE]`.
