# Print Amplified — Client Ordering App

The app where Print Amplified's clients **reorder in one tap, place new orders, and track them until delivery** — and where every client's approved artwork, colour standards, specs and prices are kept safe.

This guide is written for the **management and sales team**. You don't need to be a developer for anything in the "Day-to-day" part. The "Set-up" part is done once (or by whoever looks after the app technically).

> **Build status:** Phase 1 of 7 (foundation) is complete. Screens marked **“Coming soon”** or with a 🔨 note are built in later phases. See [What's built](#whats-built-so-far).

---

## Contents

- [Day-to-day guide](#day-to-day-guide)
  - [Signing in](#signing-in)
  - [Add a client, set its email domains and invite its users](#add-a-client-set-its-email-domains-and-invite-its-users)
  - [Deactivate a user who resigned](#deactivate-a-user-who-resigned)
  - [Add staff](#add-staff)
  - [Change the logo, colours and payment instructions](#change-the-logo-colours-and-payment-instructions)
  - [Sign-in security settings](#sign-in-security-settings)
  - [The audit log](#the-audit-log)
  - [Coming in later phases](#coming-in-later-phases)
- [What each monthly service costs](#what-each-monthly-service-costs)
- [Backups](#backups)
- [Set-up (one time)](#set-up-one-time)
- [For developers](#for-developers)

---

## Day-to-day guide

### Signing in

- Go to **order.printamplified.com** (or the address you set up).
- Sign in with your email and password, **or** tap **Email link** to get a one-time sign-in link.
- There is **no "Create account" button**. Every account is created by invitation.
- **2-step verification** (an authenticator app such as Google Authenticator or Microsoft Authenticator) is **required for all staff and every Company admin**. The first time you sign in, the app shows a QR code to scan.
- After **5 wrong passwords**, the account is locked for **15 minutes**. Both numbers can be changed in Settings.
- When someone signs in on a **new phone or computer**, they get an email about it.

Staff and clients use the same address. After signing in, staff see the staff screens and clients see their company's ordering app.

### Add a client, set its email domains and invite its users

1. **Clients → Add client.**
2. Fill in the company name, billing name, TIN and credit terms.
3. Under **Approved email domains**, type the endings of the company's work emails, without the @. For example: `abccorp.com.ph`.
4. Management can choose the **account manager**. When a sales person adds a client, they become its account manager.
5. Press **Add client**. On the next screen, under **Invite a user**, type the main contact's email, choose **Company admin**, and press **Send invite**.

What happens next:

- The contact gets an email with a link. The link **works once** and **expires in 7 days**. You can **Resend** or **Cancel** it from the same screen.
- The Company admin can invite their own colleagues, but only with an approved email domain.
- If they invite an address outside those domains (a Gmail address, or an outside agency), the invite waits for Print Amplified. The account manager gets an email and a notification, and must press **Approve & send**.
- Print Amplified staff can always invite anyone directly.

**Roles for client users**

| Role | What they can do |
|---|---|
| Company admin | Invite and remove users, place orders, see prices |
| Buyer | Place orders and reorders, see prices |
| Viewer (read-only) | See files and order status only, never prices |

### Deactivate a user who resigned

**Clients → (company) → Users → Deactivate**. A Company admin can do the same from **Account → Company users**.

- The person is **signed out everywhere immediately** and can't sign in again.
- Their orders, files and approvals **stay with the company**.
- **Reactivate** brings the account back.
- A company always needs at least one Company admin. If the only one leaves, staff must invite or promote a new one. The client page shows a warning until this is done.
- Each user's **last login** is shown, so it's easy to spot accounts nobody uses.

### Add staff

Only **management (pa_admin)** can do this: **Staff users → Invite staff**. Choose the role:

| Staff role | What they can do |
|---|---|
| Management (`pa_admin`) | Everything: clients, staff, prices, settings, payments, audit log |
| Sales / account manager (`pa_sales`) | Only the clients assigned to them: items, files, prices, quotes, orders, payments |
| Production (`pa_production`) | All orders and print files, and production status updates. **Never sees prices or payments.** |

### Change the logo, colours and payment instructions

**Settings** (only management can save changes):

- **Company details:** the name, address, phone and email shown in the app and in emails.
- **Payment instructions:** bank accounts, who cheques are payable to, and a note. Clients see these on every order. Payments always happen outside the app, by bank transfer or cheque.
- **Logo & brand colours:** the main and accent colours. If a colour is too light to read with white text, the app shows a warning and automatically uses a darker shade for buttons. Logo upload arrives in Phase 2.
- **Email sender:** the name and address that notification emails come from.

### Sign-in security settings

**Settings → Sign-in & security:**

- **Require 2-step verification.** ⚠️ The **demo data has this OFF** so you can click through quickly. **Turn it ON before real clients use the app.**
- **Sign-out after inactivity:** 12 hours on the web, and 30 days in the installed phone app (when "Keep me signed in" is ticked).
- **Lockout:** how many failed attempts are allowed, and for how many minutes the account is locked.

### The audit log

**Audit log** (management only) records sign-ins (including failed ones and lockouts), invites, deactivations, role changes, client changes and settings changes, with who, when and from which IP address. **Nobody can edit or delete entries**, not even management.

### Coming in later phases

| Guide topic | Phase |
|---|---|
| Add Print Items and files, Drive links, "Approved for Print", colour standards, CSV import | 2 |
| Set up editable fields on an item; handle revision requests and send revised proofs | 3 |
| Manage the product catalog and standard prices; reply to quote requests | 4 |
| Upload past estimates and confirm their data; update the inflation table and pricing rules; check an instant quote with the quote preview tool; update prices | 5 |
| Update orders; record payments; email notifications | 6 |
| How clients install the app on their phones; push notifications | 7 |

---

## What each monthly service costs

You decided to **start on free plans**. Prices change, so check each website before deciding.

| Service | What it does | Free plan (now) | When you outgrow it |
|---|---|---|---|
| **Supabase** | Database, logins, file storage | ₱0. Limits: **500 MB database, 1 GB file storage, 50 MB per file, no automatic backups**, and the project **pauses after 7 days with no activity** | Pro, about **US$25/month**: 8 GB database, 100 GB files, 100 MB+ per file, daily backups, never pauses |
| **Vercel** | Runs the website | ₱0 (Hobby). ⚠️ Vercel's terms say Hobby is for **non-commercial use** | Pro, about **US$20/month per member** |
| **Resend** | Sends emails | ₱0 up to 3,000 emails/month (100/day) | about US$20/month for 50,000 |
| **Cloudflare Turnstile** | Bot check on sign-in | ₱0 | — |
| **Claude API** (optional, Phase 5) | Auto-fills past estimates | Off. Pay per use, only if you turn it on | Cost per estimate shown before you enable it |

**Watch out for on the free plan:**

1. **File storage fills up fast.** 1 GB holds roughly **50–150 print files** at 3–20 MB each. Upgrade Supabase before loading the full archive.
2. **No backups.** Follow the [Backups](#backups) steps every week.
3. **Pausing.** If nobody uses the app for 7 days, Supabase pauses it. Open the Supabase dashboard and press "Restore". Daily use prevents this.

---

## Backups

Supabase Free has **no automatic backups**, so please do these:

1. **Weekly full database backup** (whoever looks after the app):
   ```bash
   npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-$(date +%F).sql
   npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup-data-$(date +%F).sql
   ```
   `SUPABASE_DB_URL` is in Supabase → Project Settings → Database → Connection string (URI). Keep the files somewhere safe, such as the company Google Drive with restricted access.
2. **One client's complete records** (data **and** files), for a handover, a client's request, or an extra backup:
   ```bash
   npm run export-client -- <client id>
   ```
   The client id is in the address bar of the client's page: `/staff/clients/<id>`. The export goes into `exports/` and **contains personal data**, so store it carefully.
3. **After upgrading to Supabase Pro**, daily backups are automatic. Turn on Point-in-Time Recovery if you want more.

---

## Set-up (one time)

### 1. Create the Supabase project
1. Create a free account at supabase.com, then **New project**. Region: **Southeast Asia (Singapore)**. Save the database password somewhere safe.
2. **Load the database.** Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the `portal` folder:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```
   ```bash
   npx supabase db push
   ```
   This creates every table and security rule. For a **demo** project only, also load the demo data: `npx supabase db push --include-seed`. **Never seed the live project.**
3. **Authentication settings** (Supabase dashboard → Authentication):
   - *Sign In / Providers:* turn **off** "Allow new users to sign up" (invite-only). Keep Email enabled.
   - *Multi-Factor:* turn **on** TOTP (authenticator app).
   - *URL Configuration:* Site URL `https://order.printamplified.com`. Redirect URLs: `https://order.printamplified.com/auth/callback` and `http://localhost:3000/auth/callback`.
   - *Attack Protection:* turn on **CAPTCHA**, choose **Turnstile**, and paste the Turnstile **secret** key.
   - *Emails → SMTP Settings:* use **Resend's SMTP** (host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key). Supabase's built-in email is only for testing and sends very few emails per hour.
   - *Emails → Templates:* so sign-in links also work when opened on another device:
     - **Magic Link:** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
     - **Reset Password:** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`
4. **Storage:** the buckets are created automatically. Leave them **private** (only `brand` is public).

### 2. Resend and Cloudflare
- **Resend:** add and verify the domain `order.printamplified.com` (Resend shows the DNS records to add), then create an API key.
- **Cloudflare Turnstile:** add a site for `order.printamplified.com` to get a site key and a secret key.

### 3. Put the app online (Vercel)
1. In Vercel, **Add New → Project** and import this GitHub repository.
2. **Root Directory: `portal`**. This is important, because the old estimator and the BNI pages stay where they are.
3. Add every variable from `.env.example` under Environment Variables.
4. Deploy. Then **Settings → Domains → add `order.printamplified.com`** and add the DNS record Vercel shows.

### 4. First management account
Use a demo account on a demo project. For the **live** project, create the first admin once:
1. In Supabase → Authentication → Users → **Invite user**, enter your email. Set a password through the email link.
2. In Supabase → SQL Editor, run (with your email):
   ```sql
   update public.profiles set staff_role = 'pa_admin', full_name = 'Your Name' where email = 'you@printamplified.com';
   ```
3. Sign in, set up 2-step verification, and invite everyone else from the app.

### Demo accounts (demo seed only)
Password for all of them: **`Demo-Print-2026!`**

| Who | Email |
|---|---|
| Management | `admin@pa-demo.test` |
| Sales (ABC Corporation) | `sales1@pa-demo.test` |
| Sales (Sunrise Foods) | `sales2@pa-demo.test` |
| Production | `production@pa-demo.test` |
| ABC Corporation: Company admin / Buyer / Viewer | `admin@`, `buyer@`, `marketing@abccorp-demo.test` |
| Sunrise Foods: Company admin / Buyer / Viewer | `admin@`, `purchasing@`, `brand@sunrisefoods-demo.test` |

---

## What's built so far

**Phase 1 — Foundation ✅**
- **Database:** the full schema for all of v1 (companies, users, catalog, quotes, Print Items, files, previews, revisions, past estimates, pricing rules, instant quotes, orders, payments, audit log), with **Row Level Security on every table and storage bucket**.
- **Sign-in:** password or email link; 2-step verification (enforced by the database itself); lockout after failed attempts; Turnstile; new-device emails; inactivity sign-out; sign out of all devices.
- **Invitations:** single-use, 7-day links; email-domain rules with staff approval; resend and cancel; deactivate and reactivate; role changes.
- **Client app:** ordering home (Reorder / New Order / Track), quick-reorder cards, active orders, account manager card (call, Viber, email); orders list and detail with payment instructions; My Print Items; Account and Company users.
- **Staff app:** dashboard (KPIs, work queue, orders by status); orders; quote requests and revision queue (read-only for now); clients (create, domains, account manager, users and invites); Print Items list; staff users; Settings; audit log.
- **Privacy notice** (draft, Data Privacy Act RA 10173) and an export script for one client's data.
- **Demo data** and **tests** (see below).

---

## For developers

```bash
cd portal
npm install
cp .env.example .env.local     # fill in Supabase values
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | TypeScript (strict) and ESLint |
| `npm test` | Unit tests (money, password rules, colours, tokens) |
| `npm run db:local` | Builds a test database on a plain local PostgreSQL: `tests/rls/supabase-shim.sql` (a stand-in for Supabase's `auth`/`storage` schemas, **tests only**), then all migrations, then the seed |
| `npm run test:rls` | **Isolation proof:** for every table and bucket, Client A gets 0 rows of Client B; guessed ids; prices hidden from viewers and production; deactivation; 2FA; locked artwork; append-only audit log; invite rules |
| `npm run test:api` | The same proof through the **live Supabase API** with each demo user's own token (set `TEST_SUPABASE_*`) |

**Key rules for anyone changing the code**
- All screen text lives in `src/i18n/en.ts`.
- Money: integer **centavos** for amounts, `numeric(14,4)` for unit prices, `decimal.js` in code. Never floats.
- `supabaseServer()` acts as the signed-in user (RLS applies). `supabaseAdmin()` bypasses RLS: use it only on the server, after an explicit permission check.
- New tables need `organization_id`, RLS policies and a line in `tests/rls/isolation.test.ts` (the test already loops over every table automatically).
- Generate typed database types once the Supabase project exists: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
