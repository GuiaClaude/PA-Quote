# PA Billing & Collections

Job Order Control, Billing, Accounts Receivable, Statement of Account and automated weekly collection drafting for
**Print Amplified OPC**, integrated with the Google Sheets Job Order List (master), Google Drive (SOA storage) and
Gmail (approval-gated sending).

* The **Job Order List sheet stays the master** for job orders and payment status.
* Every Monday **08:00 Asia/Manila** each billed project not marked Paid gets one collection draft with a fresh SOA.
* **No email is sent without explicit human approval**; sending re-checks the sheet first.
* Balances come from a reconciled transaction ledger; every material action is audited.

```bash
npm ci && npm run build && npm run migrate && npm start   # see docs/DEPLOYMENT.md
npm test                                                  # 34 tests incl. acceptance tests 1–20
```

| Doc | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Discovery findings, architecture, source-of-truth rules, integration status |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Google Cloud setup, environment, scheduling, backups |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Roles, settings, monitoring, exception types |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Weekly cycle, approvals, accounting tasks |
| [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) | Test results |
| [.env.example](.env.example) | Environment template |

Layout: `server/` (Express API, services, domain logic, migrations, tests) · `web/` (React UI).
