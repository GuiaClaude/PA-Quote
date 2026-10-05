# Try Print Amplified Finance on your PC (Windows)

This runs the app **on your own computer** with **made-up demo data**. Nothing goes online and nothing touches your real files.

## One-time setup (about 15 minutes)

1. **Install Docker Desktop**: <https://www.docker.com/products/docker-desktop/> → *Download for Windows* → run the installer with the default options → restart the PC if asked.
2. Open **Docker Desktop** once and wait until the bottom-left corner says **Engine running**. (You can skip signing in.)
3. **Download the app**:
   - Open <https://github.com/GuiaClaude/PA-Quote/tree/claude/print-amplified-finance-spec-1tvljx>
   - Click the green **Code** button → **Download ZIP**.
   - Right-click the downloaded ZIP → **Extract All…** → choose a folder (e.g. *Documents*).

## Start it

1. Make sure **Docker Desktop** is open (Engine running).
2. In the extracted folder, double-click **`start-preview.bat`**.
   If Windows shows "Windows protected your PC", click **More info → Run anyway**.
3. The **first start takes about 5–10 minutes**: it downloads and builds everything. Later starts take seconds.
4. Your browser opens **http://localhost:3000** by itself. Pick a demo user to sign in.

| To… | Double-click |
|---|---|
| Stop the app (keeps what you entered) | `stop-preview.bat` |
| Start again | `start-preview.bat` |
| Throw away your test entries and get fresh demo data | `reset-preview-data.bat` |

## Things to try

Sign in as **Demo Owner** first.

**Dashboard**
- [ ] Switch Week / Month / Quarter / Year / Custom, and use ‹ › to move between periods. Each figure shows the change against the previous period.
- [ ] Hover over the chart for the monthly amounts; click **Show as table**.
- [ ] Click a client or billing in **Overdue billings**.

**Billing → payment**
- [ ] **Billings → New billing**: pick a client, enter a line (e.g. Flyers, qty 1, ₱11,200). Watch net of VAT (₱10,000), VAT (₱1,200) and expected CWT calculate as you type. Save.
- [ ] On the billing page, look at **Journal entries**: the accounting was done for you.
- [ ] Click **Receive payment**: the 2% CWT is pre-filled. Try a partial payment (change the cash amount), save, and see the balance and status change.
- [ ] **Collections → Missing 2307**: payments where the client's BIR 2307 hasn't arrived.
- [ ] Add a **follow-up note** on an overdue billing (Taglish is fine).
- [ ] Try **Void** on an unpaid billing: its journal entry is reversed, not deleted.

**Purchases**
- [ ] **Bills → New bill**: choose a supplier and split one receipt across two categories. Tick *No valid receipt* and see the input VAT disappear.
- [ ] **Pay bills**: pay a bill via BizLink or Spenmo.
- [ ] **Projects / CE#**: profit per job.

**Clients**
- [ ] **Clients** shows a suggested duplicate (*Bluefin Trading* vs *BLUE FINN TRADING*). Try **Merge**.
- [ ] Open a client to see aging and how many days they usually take to pay.

**Accounting & controls**
- [ ] **Chart of accounts**: balances, and the "✓ Balanced" check at the bottom.
- [ ] **Journal entries → Manual entry**: the Post button stays disabled until debits = credits.
- [ ] **Settings → Close a period** (e.g. last month). Then try to add a bill dated in that month: it's refused. As Owner, **Unlock** it (a reason is required and logged).
- [ ] Sign out (bottom-left) and sign in as **Demo Viewer**: you can look at everything but can't add or change anything.

## Telling me what you found

For anything that looks wrong or confusing, send a screenshot with a line about what you expected. Wording, layout and missing fields are all useful.

*The demo data is invented (names, TINs and amounts). Imports from your Excel files come in Phase 2.*
