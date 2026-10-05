# Print Amplified Finance

Billing, collections, purchases, payables and financial reports for **PRINT AMPLIFIED OPC**:
QuickBooks-style accounting with Philippine VAT, CWT (BIR 2307) and payroll rules.

This folder is the web app. The older **PA-Quote** cost estimator in the parent folder is separate and keeps working as before.

> **Status: Phase 1 (Foundation).** Working now: sign-in with roles, clients & suppliers, projects (CE#),
> billings, collections with CWT, supplier bills and payments, automatic double-entry posting, manual journal entries,
> chart of accounts, period closing, audit log, and the dashboard.
> Not yet: Excel/Sheets/Dropbox imports (Phase 2–3), reports & PDF exports (Phase 4), bank, payroll and AI insights (Phase 5).

---

## What you need

| Service | Why | Cost |
|---|---|---|
| **GitHub** account | Stores the code (you already have this) | Free |
| **Supabase** account, <https://supabase.com> | The database, sign-in and file storage | Free to try; **Pro US$25/mo** recommended for daily backups |
| **Vercel** account, <https://vercel.com> | Hosts the website | Hobby is free but for non-commercial use; **Pro US$20/mo** for a business |

Phase 2 onward will also need Google Cloud, Dropbox, Inngest, Resend and Anthropic accounts. Instructions will be added when those phases are built.

---

## Deploying (step by step)

### 1. Create the Supabase project
1. Sign in at <https://supabase.com> → **New project**.
2. Name: `pa-finance`. Region: **Southeast Asia (Singapore)**. Set a strong database password and **save it** in your password manager.
3. Wait about 2 minutes for it to finish.

### 2. Create the database tables
1. In Supabase, open **SQL Editor** → **New query**.
2. Open the file `finance/supabase/migrations/0001_core.sql` on GitHub, click **Raw**, copy everything, paste it into the SQL editor and click **Run**. You should see "Success".
3. Do the same for any later files in that folder, in number order.

### 3. Copy the keys you'll need
In Supabase:
- **Project Settings → Database → Connection string → "Transaction pooler"**. Copy it and replace `[YOUR-PASSWORD]` with the password from step 1. This is `DATABASE_URL`.
- **Project Settings → API**: copy the **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`), the **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`, which must stay secret).

### 4. Put the site on Vercel
1. Sign in at <https://vercel.com> with GitHub → **Add New… → Project** → pick the `PA-Quote` repository.
2. **Root Directory**: click *Edit* and choose `finance`. Framework: Next.js (detected automatically).
3. Under **Environment Variables**, add each line from the table below.
4. Click **Deploy**. When it finishes you get a link like `https://pa-finance.vercel.app`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | from step 3 |
| `SESSION_SECRET` | a long random string. On a Mac/Linux terminal run `openssl rand -base64 48`, or use any password generator set to 64 characters |
| `AUTH_MODE` | `supabase` (production sign-in arrives with the deployment step of Phase 1; until then use `dev` on a **private** preview only) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from step 3 |

Never paste these values into GitHub, chat or email. `.env.example` lists the names only.

---

## Running it on a computer (for a developer)

Needs Node.js 22, pnpm, and PostgreSQL 15 or newer.

```bash
cd finance
cp .env.example .env.local        # then edit DATABASE_URL and SESSION_SECRET
pnpm install
pnpm db:reset                     # creates the local database and fills it with made-up demo data
pnpm dev                          # open http://localhost:3000
```

With `AUTH_MODE=dev` the sign-in page lets you pick a demo **Owner**, **Bookkeeper** or **Viewer**.

### Tests

```bash
pnpm test          # unit tests: money/VAT maths, dates, aging, posting rules (always balanced), TIN/name matching
pnpm test:db       # database tests: role security (RLS), balanced entries, period locks, audit log
pnpm e2e           # browser tests: bill → collect with CWT → dashboard; viewer is read-only; closed periods
```

---

## How the accounting works (plain language)

- **You never write journal entries for normal work.** Saving a billing, payment, bill or supplier payment creates the matching double-entry automatically, and the database refuses any entry whose debits and credits don't match.
- **Mistakes are corrected, not erased.** Changing or voiding a document adds a *reversal* entry, so the history is always complete.
- **Money is stored in centavos** (whole numbers), so totals never drift by a centavo.
- **VAT**: 12%, prices entered VAT-inclusive. Before 04/01/2024 output VAT is recognised **when collected**; from 04/01/2024, **when billed** (EOPT). Both dates can be changed in the database and should be confirmed by your accountant.
- **CWT (BIR 2307)**: when a client withholds tax, the app records it as a tax credit and tracks whether you've received the 2307.
- **Closing a month** stops anyone from changing it. Only the Owner can reopen it, and the reason is kept in the audit log.
- **Roles are enforced by the database**, not just hidden buttons: a Viewer cannot change data even by calling the server directly.

*Tax figures are for planning. Please confirm with your accountant / BIR.*

## Project layout

```
finance/
  supabase/migrations/   database tables, security rules (RLS), triggers
  db/                    local-only helper that imitates Supabase on a plain Postgres
  scripts/               migrate, seed (synthetic data), screenshots
  src/lib/domain/        accounting rules: money, VAT, dates, periods, aging, posting (pure, unit-tested)
  src/server/            database access, sign-in, document services, server actions
  src/app/               pages (dashboard, billings, collections, …)
  tests/                 database tests and browser (end-to-end) tests
```
