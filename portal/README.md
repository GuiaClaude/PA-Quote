# Print Amplified — Client Ordering App

The app where Print Amplified's clients **reorder in one tap, place new orders, and track them until delivery** — and where every client's approved artwork, colour standards, specs and prices are kept safe.

This guide is written for the **management and sales team**. You don't need to be a developer for anything in the "Day-to-day" part. The "Set-up" part is done once (or by whoever looks after the app technically).

> **Build status:** All 7 phases are built: foundation; file archive and Print Items; review & revise; catalog, new orders and quotes; past estimates and one-click reorder; order tracking and payments; phone app, push notifications and launch kit. **Before real clients use it**, follow [Going live](#going-live-checklist). See [What's built](#whats-built-so-far).

---

## Contents

- [Day-to-day guide](#day-to-day-guide)
  - [Signing in](#signing-in)
  - [Add a client, set its email domains and invite its users](#add-a-client-set-its-email-domains-and-invite-its-users)
  - [Deactivate a user who resigned](#deactivate-a-user-who-resigned)
  - [Add staff](#add-staff)
  - [Add Print Items and files](#add-print-items-and-files)
  - [Approve a version for print](#approve-a-version-for-print)
  - [Google Drive links](#google-drive-links)
  - [Colour standards](#colour-standards)
  - [Import old records (CSV) and upload old files in bulk](#import-old-records-csv-and-upload-old-files-in-bulk)
  - [What clients see (and can't take)](#what-clients-see-and-cant-take)
  - [Manage the product catalog and standard prices](#manage-the-product-catalog-and-standard-prices)
  - [Reply to quote requests](#reply-to-quote-requests)
  - [How clients place a new order](#how-clients-place-a-new-order)
  - [Set up editable fields on an item](#set-up-editable-fields-on-an-item)
  - [Handle revision requests and send revised proofs](#handle-revision-requests-and-send-revised-proofs)
  - [How clients review, mark up and approve](#how-clients-review-mark-up-and-approve)
  - [Upload past estimates and confirm their prices](#upload-past-estimates-and-confirm-their-prices)
  - [Inflation table and pricing rules](#inflation-table-and-pricing-rules)
  - [How instant reorder quotes work](#how-instant-reorder-quotes-work)
  - [Check a price with the quote preview tool](#check-a-price-with-the-quote-preview-tool)
  - [Update an agreed price or change an instant quote](#update-an-agreed-price-or-change-an-instant-quote)
  - [How clients reorder](#how-clients-reorder)
  - [Optional: AI auto-fill (paid, off by default)](#optional-ai-auto-fill-paid-off-by-default)
  - [Confirm and update orders](#confirm-and-update-orders)
  - [Record payments](#record-payments)
  - [What clients see while an order is in progress](#what-clients-see-while-an-order-is-in-progress)
  - [Who gets emails and notifications](#who-gets-emails-and-notifications)
  - [Change the logo, colours and payment instructions](#change-the-logo-colours-and-payment-instructions)
  - [Sign-in security settings](#sign-in-security-settings)
  - [The audit log](#the-audit-log)
  - [How clients install the app on their phones](#how-clients-install-the-app-on-their-phones)
  - [Turn on notifications](#turn-on-notifications)
- [What each monthly service costs](#what-each-monthly-service-costs)
- [Backups](#backups)
- [Set-up (one time)](#set-up-one-time)
- [Going live checklist](#going-live-checklist)
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

### Add Print Items and files

A **Print Item** is the permanent record of something a client orders again and again ("Product Brochure A4 Trifold", "Shipping Box Medium"). It holds the specs, every artwork version, the colour standard, prices and order history.

1. **Print Items → New Print Item.** Choose the client, type the name and item code, and fill in the specs: size, material and GSM, colours, finishing (separated by commas) and packaging.
2. Press **Create Print Item**. It opens with an empty **Version 1**.
3. Under Version 1, **drag files into the box** or press **Choose files**. Accepted: PDF, AI, PSD, EPS, INDD, TIFF, JPG, PNG and ZIP, up to **50 MB each** on the free plan.
   - The app checks whether **the same file is already stored** for this client and warns you before uploading it again.
   - A progress bar shows the upload. Then the app makes the **low-res preview** automatically, which takes a few seconds per page.
   - **PSD, EPS, INDD and ZIP** files can't be previewed automatically. Press **Upload preview image** and add a JPG or PNG of the design. It gets the same watermark.
   - If a preview fails, press **Regenerate preview** (the circular arrow).
4. To change artwork later, press **New version**, describe what changed, upload the new files, and approve it.

### Approve a version for print

Press **Approve for Print** on a version, then confirm.
- It becomes the version used for every reorder. Its preview is what the client sees, and page 1 becomes the item's thumbnail.
- It is **locked**: its files can't be removed or changed, by anyone, including management. The database itself enforces this.
- The previously approved version becomes **Superseded** and stays in history forever.
- Who approved it, when, and from which IP address is recorded (**Prices & history** tab).

### Google Drive links

Some artwork lives only in a client's or agency's Google Drive. Under a version, use **Add a Google Drive link** (paste the link and a label).
- Versions with only a link show a red warning: **"External link only — may be lost if the owner's account is removed."**
- Download the file from Drive, upload it under the same version, then press **Mark as copied**. This works even after the version is approved.
- **Print Items → filter "Drive link only"** lists every item still at risk.

### Colour standards

On an item, open the **Colour standard** tab. Enter the Pantone references, CMYK targets (one per line, e.g. `ABC Blue: 100 72 0 6`), paper stock, press, notes, and who approved it and when. Then add **photos or scans of the approved press sheet**. Clients see the colour standard and the photos (low-res) on their item page.

### Import old records (CSV) and upload old files in bulk

**Print Items → Import CSV** (or **Import old records** in the menu):
1. **Download the template**, fill it in with Excel or Google Sheets (one row per Print Item), and save it as **CSV**.
   - New client names create new clients, assigned to you. Existing names (exact match) are reused.
   - Inside one cell, separate lists with a semicolon: `matte lamination;spot UV`.
   - Rows whose item code already exists for that client are **skipped**, so importing twice is safe.
2. Choose the CSV. The app checks every row first and shows problems in red. Press **Import**.
3. **Upload the files.** Name each file starting with its item code: `ABC-BR-01.pdf`, `ABC-BR-01__back.pdf`. Choose all the files at once. The app matches each file to its item. Optionally tick **Mark as Approved for Print after upload**.

### What clients see (and can't take)

- Clients see **low-resolution previews** (about 1,200 px) with a light **"Print Amplified — Preview Only"** watermark: page by page, front and back, with zoom. It's two taps from their home screen: **My Items → the item**.
- The **high-resolution print files never reach the client's browser**. There is no download button, right-click and dragging are blocked, and preview links expire after 10 minutes.
- Screenshots can't be prevented. That's why previews are low-res and watermarked.
- If a client needs its own print files, management can switch on **Allow high-res download** for that client (Clients → company → Company details). Their users then see download links for the **approved** files, and every download is recorded in the audit log.

### Manage the product catalog and standard prices

**Catalog** in the menu.
- **Categories** (right-hand panel): add or rename them (Marketing Collateral, Stationery…), set their order, or hide them.
- **New product:** set its category, name, description, lead time ("5–7 working days") and **who can order it**: all clients, or only selected clients. Other clients never see client-only products, not even their names.
- On the product page:
  - **Photos:** the first one is the main photo in the client catalog.
  - **Choices clients pick from:** sizes, papers (with GSM), colours, finishing, packaging, and suggested quantities ("100, 200, 500, 1000").
  - **Standard prices:** choose a combination of choices, a quantity and the total price, then tick VAT inclusive and set an optional "valid until". When a client picks exactly that combination and quantity, they see the price immediately and can **Place order** without waiting. Hide a price with the eye icon.

Anything without a standard price (other specs, other quantities, custom requests) automatically becomes a **quote request**.

### Reply to quote requests

**Quotes** in the menu lists requests, oldest first, with how long each has waited (red when overdue). The dashboard shows the same.
1. Open a request to see the specs, quantities, needed-by date, delivery address, notes, any "needs design help" flag, and the client's artwork files and Drive links.
2. In **Reply with a quote**, each quantity the client asked for is already listed. Type the **total** or the **price per piece**; the other is worked out exactly. You can add more quantities.
3. Check the lead time, the **valid until** date (defaults to today + quote validity days) and VAT, then add notes and press **Send quote to client**.
4. The client gets an email and an in-app notice. They tap **Accept quote** and it becomes a **confirmed order** at that price. You get notified.
5. To change a sent quote, send a **revised quote** from the same page. It replaces the earlier one.
6. Questions from the client appear under **Questions**, and you can reply there. Declined quotes show the client's reason.

When a **new** order is **delivered**, the app automatically creates a **Print Item** from it, with the specs, the price paid and an empty version. Upload the final print file there and approve it, and next time the client can simply reorder.

### How clients place a new order

**New Order** → choose a product → four short steps: **Specs** (tap the options, or describe something custom), **Quantity**, **Artwork** (upload files, paste a Drive link, or tick "I need design / layout help") and **Delivery** (address, needed-by date, PO number, notes).
- If the choices match a standard price, the price shows straight away and the button says **Place order**.
- Otherwise it says **Request quote**. Choosing several quantities also gets a quote, so the client can compare prices.
- **Save draft** keeps the form so they can finish it later (New Order → Your saved drafts).
- Clients see their quotes under **My Orders → Quotes**. The home screen shows a banner when a quote is ready.

### Set up editable fields on an item

For items that change often (business cards, ID cards, labels, price tags, certificates), clients can type new text and see it on the preview instantly.
1. Open the item, then press **Editable fields** (top right). The item needs an approved version with a preview.
2. **Drag a box** over each piece of text clients may change. Drag a box to move it; drag its red corner to resize.
3. For each field, set the **label** clients see ("Mobile"), the **current text** on the artwork, the **font, size (pt), weight, colour and alignment**, the **maximum characters**, and **Cover**. Cover paints the box in the background colour first, so the old text disappears.
4. Type a **Test text** (a long name, for example) to check that it fits. Text shrinks automatically when it's too long.
5. Press **Save**.

**Fonts:** to make the preview look exactly like the artwork, upload the font used (TTF, OTF, WOFF) under **Upload a font**. It is then available for every item. Without it, a standard font is used.
The client's preview is only a guide: prepress always makes the change in the real file. If clients already used the old fields, saving creates a new set and keeps the old one for history.

### Handle revision requests and send revised proofs

**Revisions** in the menu is the prepress queue (oldest first). Requests waiting more than a day are shown in red, and the account manager also gets an email and an in-app notice.
1. Open a request. You see the client's **numbered pins and boxes** on the preview, their comments and attached files, any **edited text** (drawn where it goes, with **Copy** buttons), and general notes.
2. Press **Start work** so the client sees it's being handled. Download the print files from **Print files to edit**.
3. Reply to each mark if useful (**Done** or **Question**). The client sees your replies.
4. Press **Start revised proof**, then upload the revised print file. The low-res preview is made automatically. Check it with the **before/after slider**.
5. Add an optional message, then press **Send proof to client**. The client gets an email and an in-app notice. If the request came from an order, the order shows **Waiting for Client Approval**.
6. When the client **approves**, the new version becomes **Approved for Print** and is locked, the old one is kept in history, and the order moves to **Approved for Print**. If they ask for more changes, **Revision 2** appears in the queue, and so on.

### How clients review, mark up and approve

- From an item (or an order), the client opens **Review artwork** and sees exactly what was printed last time.
- **Confirm — print as is** goes straight to the one-click reorder screen.
- **I have revisions** lets them:
  - **drop pins** or **draw boxes** on the preview, type what to change at each spot, and attach files (a new logo, a photo, a text document)
  - **edit text fields** and see the result immediately ("Preview only — final file will be prepared by Print Amplified prepress")
  - add general notes and files
  Then they press **Send changes**.
- When the revised proof is ready, they compare it with the previous version (slider or side by side), then press **Approve** (their name, the date and time, and their IP address are recorded) or **I have more changes**.
- Marks are saved as percentages of the page, so they line up on any screen and at any zoom.
- Clients never see draft versions, only approved versions and the proofs sent to them, and never the high-res files.

### Upload past estimates and confirm their prices

Your old cost estimates and quotations are where instant reorder prices come from.

1. Go to **Past estimates → Add estimate**. Pick the client (and the Print Item if it already exists).
2. Upload the original file (PDF, Excel, Word or a photo). Clients never see it. No file? Press **Type it in**.
3. On the next screen the original is on the left and the form is on the right. Fill in:
   - the estimate number and date (inflation is counted **from this date**);
   - whether the prices **include 12% VAT** (most of ours do);
   - one line per quoted quantity (type the total *or* the price per piece);
   - one-time charges (plates, dies, setup). Switch on **charge again on reorder** only if a reorder needs it again.
4. Link it to a Print Item (or type a name and press **Create**).
5. Press **Save draft** to finish later, or **Confirm prices**. After confirming, the lines become the item's **agreed prices**. A confirmed estimate can't be edited; upload a newer one instead. An older estimate never replaces a newer agreed price.

**Many at once:** **Past estimates → Bulk import**. Download the CSV template (one row per quantity), fill it in, and import. Then select all the original files at once. Each file name must **start with the estimate number**, e.g. `CE-2024-0099.pdf`. Leave "Confirm straight away" off unless the spreadsheet is already checked, and review the drafts instead.

### Inflation table and pricing rules

**Pricing** in the staff menu (management can change it; sales can view it):

- **Yearly inflation.** One rate per year. The 2022–2026 figures are pre-filled from PSA and marked **please confirm**. Check each one and press **Confirm**. A year with no rate uses the latest earlier rate.
- **Rounding.** Round the total up to ₱1, ₱5 (default) or ₱10, or round the price per piece instead.
- **Limits.** The oldest estimate allowed for instant quotes (default 3 years) and the largest automatic increase (default 20%). Anything over a limit goes to staff as a quote request.
- **Quote validity** (default 15 days), the **VAT rate**, and whether clients see the **price breakdown** (default: final price only).
- **Surcharges** (e.g. paperboard +5% from 1 Dec) and **fixed add-ons** (e.g. delivery ₱300), each with a start date. Press ⏹ to end one.

Saving the rules creates a new version. Past quotes keep the version they were made with.

### How instant reorder quotes work

> Instant price = agreed price × inflation since its date × (1 + surcharges) × (1 + client adjustment) + fixed add-ons + one-time charges billed again, then **rounded up**.

- Inflation compounds year by year and is counted by days for part-years. For example, half a year at 2% adds about 1%, not 2%.
- VAT-inclusive prices are converted to VAT-exclusive first, so VAT is never inflated twice. The client sees a VAT-inclusive total, with the VAT shown.
- **Never below the past price**, unless the client has a discount (set on the client's page). A negotiated cap per client is also respected.
- **Instant only if all of these are true:** a confirmed agreed price for exactly that quantity, the same specs, no artwork changes, the estimate isn't too old, the increase is within the limit, and instant quotes are on for that client. Otherwise the client presses **Ask for a quote** and you get a quote request with the reasons and a suggested price.
- Every instant quote is saved with every input (past price, date, each year's rate, surcharges, rules version), so any price can be explained later.

### Check a price with the quote preview tool

**Pricing → Quote preview** (or **Preview quote** on an item's **Prices & history** tab). Pick an item and a quantity to see the exact price a client would get, step by step, and why it would need a manual quote if it's blocked. Nothing is saved.

### Update an agreed price or change an instant quote

On a Print Item → **Prices & history**:

- **Set a price by hand.** Enter the quantity, total, the date the price was agreed and a reference. The old price is kept in the history.
- **Recent instant quotes.** Press ✏️ on an offered quote to change its total. A reason is required, and the old total is kept. You can't change a quote after the client accepts it.

### How clients reorder

From **Home**, **My Print Items** or an item's page, the client presses **Reorder**:

1. **Is the artwork still correct?** *Yes, print as is* or *I have changes* (this opens the markup screen; the reprint is quoted after they approve the new proof).
2. **How many?** Each quantity with an agreed price shows its price today. **Other quantity** or **I need different specs** turns into **Ask for a quote**.
3. **Delivery.** Address, needed-by date, PO number and notes. **Same as last order** fills in the last quantity and address.
4. **Reorder now — ₱…** places a confirmed order straight away. You get an email. The line under the price says *"Based on your previous order/estimate of [date], adjusted for current costs."*

**Add to cart** collects several items into **one order** (cart icon at the top). Prices that have expired are re-priced at today's rates before checkout, and the client sees the new price before ordering. Prices are always worked out on the server; the browser can't change them.

### Optional: AI auto-fill (paid, off by default)

AI auto-fill reads an uploaded estimate (PDF or photo) and fills the form **for staff to check**. Nothing is saved until staff press **Save**. Anything it was unsure about is listed at the top.

- **Cost:** about **US$0.04–0.08 (₱2–5) per estimate**, billed by Anthropic to your own account. Run it on a few real estimates and check the actual cost before using it widely; every use is in the audit log with the tokens used.
- **To turn it on:** (1) create an API key at console.anthropic.com and add it as `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables; (2) in **Settings → Optional paid features**, switch on **AI auto-fill**. The **Auto-fill from file** button then appears on estimates that have a file.
- Excel and Word files can't be auto-filled yet; save them as PDF first.

### Confirm and update orders

Open **Orders** and click an order. Use the chips to filter: **New** for orders to confirm, or **Unpaid or partly paid**.

**Confirm a new order** (management and sales):

1. Check the items, the artwork and the price.
2. To change a price (for example a rush fee), type the **new total** next to that item. Leave the box empty to keep the price. Items without a price (a "design help" order, for example) need one before you can confirm.
3. Add a note for the client if you like, then press **Confirm order**. The client gets an email. If you changed the price, the email asks them to check the new total.

**Update the status** (management, sales **and production**):

1. Under **Update status**, choose the next step. The app suggests the usual next one. You can skip steps; small jobs often go straight from Confirmed to Printing.
2. Add a note if helpful (e.g. *Truck left 8:40 AM, driver Jun*).
3. Press **Add photos** to take or choose production or delivery photos. For the **signed delivery receipt**, switch on *These files are the signed delivery receipt* (a photo or PDF).
4. Switch off **Show this update to the client** for an internal note (e.g. *reprinting sheet 3*). The status itself always shows to the client.
5. Press **Update to …**.

Rules: **Delivered** can only become **Closed**. Cancelled and Closed orders can't be changed. Production can't confirm or cancel orders and never sees prices or payments.

**Add a receipt later.** On a delivered order, use **Add a receipt or photos**.

**Cancel.** Management and sales can cancel any order that isn't delivered yet (a reason is required, and the client is told). Clients can cancel their own order only while it is **Submitted**. After that they're asked to contact you.

**After delivery: save the final price.** A delivered order shows *Save as agreed prices*. Press it to make the order's final prices the item's new agreed prices, dated today, so future instant reorder quotes start from them. The old prices stay in the price history.

### Record payments

Clients pay by bank transfer or cheque outside the app. You record what arrived:

1. Open the order. In **Payment**, open **Record a payment**.
2. Choose **Bank transfer** or **Cheque**, then type the reference or cheque number, the bank, the amount (the balance is pre-filled) and the date received.
3. Press **Record payment**. The status updates by itself: **Unpaid → Partially Paid → Paid**. The client gets an email with the amount and the remaining balance.

**Made a mistake, or a cheque bounced?** Press 🗑 next to the payment and give a reason. It is removed from the total but kept in the audit log; payments are never truly deleted.

**Payment slips.** Clients can send a photo of their deposit slip or cheque from their order page. You get an email and a notice, and the photo appears under *Slips from the client*. A slip is **not** a payment: check your bank first, then record the payment.

To find money still owed, press **Unpaid** on the dashboard or choose **Unpaid or partly paid** on the Orders list.

### What clients see while an order is in progress

- A five-step progress bar: **Submitted → Confirmed → In production → Ready / on the way → Delivered**, with a red banner if the order is **On Hold**.
- The full timeline with the date and time of every step, your notes and the photos and receipts (photo links expire after 10 minutes).
- For admins and buyers: the total with VAT, what's been paid, the balance, each payment recorded, your payment instructions, and **Send slip photo**. Viewers see the status and photos but no money.

### Who gets emails and notifications

| Event | Client (admins + buyers; viewers for status) | Your staff assigned to the client |
|---|---|---|
| Order placed / quote requested | — | email + notice |
| Order confirmed (or price changed) | email + notice | — |
| Status changed | notice for every visible change; **email** for Approved for Print, Printing, Ready for Pickup, Out for Delivery, Delivered, On Hold | — |
| Order cancelled | email + notice (if you cancel) | email + notice (if the client cancels) |
| Payment recorded | email + notice | — |
| Payment slip sent | — | email + notice |

The person who placed the order always gets their order's emails. Internal steps (Prepress, Finishing, Quality Check) only appear as notices, to avoid too many emails.

### Change the logo, colours and payment instructions

**Settings** (only management can save changes):

- **Company details:** the name, address, phone and email shown in the app and in emails.
- **Payment instructions:** bank accounts, who cheques are payable to, and a note. Clients see these on every order. Payments always happen outside the app, by bank transfer or cheque.
- **Logo & brand colours:** the main and accent colours. If a colour is too light to read with white text, the app shows a warning and automatically uses a darker shade for buttons.
- **Logo:** upload a PNG or SVG (wide, transparent background). It appears on the sign-in page and in the app. **Use standard mark** brings back the built-in hexagon.
- **Email sender:** the name and address that notification emails come from.

### Sign-in security settings

**Settings → Sign-in & security:**

- **Require 2-step verification.** ⚠️ The **demo data has this OFF** so you can click through quickly. **Turn it ON before real clients use the app.**
- **Sign-out after inactivity:** 12 hours on the web, and 30 days in the installed phone app (when "Keep me signed in" is ticked).
- **Lockout:** how many failed attempts are allowed, and for how many minutes the account is locked.

### The audit log

**Audit log** (management only) records sign-ins (including failed ones and lockouts), invites, deactivations, role changes, uploads, preview views, high-res downloads, revisions, approvals, price and pricing-rule changes, order status changes, payments (recorded and voided), cancellations, removals and settings changes, with who, when and from which IP address. **Nobody can edit or delete entries**, not even management.

Filter by **area** (e.g. Payments), **person** (part of an email) and **dates**, then press **Export CSV** to open it in Excel (up to 20,000 rows; the export itself is logged).

### How clients install the app on their phones

No app store is needed. Send clients the link **https://order.printamplified.com** and tell them:

**iPhone (Safari)**
1. Open the link in **Safari** (not Chrome or the Facebook/Viber browser) and sign in.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open **PA Orders** from the home screen. It opens full screen, like any app.

**Android (Chrome)**
1. Open the link in **Chrome** and sign in.
2. Tap **Install** on the card at the top of the home screen (or ⋮ → **Install app** / **Add to Home screen**).
3. Open **PA Orders** from the home screen or the app drawer.

**Computer (Chrome or Edge):** click the install icon at the right of the address bar, or ignore it. The website works the same.

Why install: it stays signed in longer when *Keep me signed in* is ticked (30 days instead of 12 hours, editable in Settings), it can receive push notifications, and it shows a friendly offline screen when there's no signal. Nothing private is saved on the phone: every screen is loaded fresh from the server.

### Turn on notifications

Each person turns notifications on **per phone or computer**: **Account → Notifications → Notifications on this device**. The phone asks for permission; tap **Allow**. A "Notifications are on" message arrives straight away, as a test.

- **iPhone:** works only in the **installed** app (iOS 16.4 or newer). In Safari the switch explains this.
- **Turned it off by mistake / tapped "Don't allow":** allow notifications for the app in the phone's settings, then switch it on again.
- People get the same events as their in-app notices (order confirmed and status changes, quote ready, proof to approve, payment received; for staff: new orders, quote requests, revisions, payment slips). Emails continue as before.
- A shared phone: whoever switches notifications on last receives them.
- Push needs the two **VAPID keys** set once on the server (see [Set-up](#3-put-the-app-online-vercel)). Without them, the switch says push isn't set up and everything else still works.

---|---|
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
| **Claude API** (optional) | Auto-fills past estimates | Off. Pay per use, only if you turn it on | About US$0.04–0.08 (₱2–5) per estimate |

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
   This creates every table and security rule. For a **demo** project only, also load the demo data with `npx supabase db push --include-seed`, then put real demo files and previews behind it with `npm run seed:files`. **Never seed the live project.**
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
3. Add every variable from `.env.example` under Environment Variables. Two need creating first:
   - `DEVICE_HASH_SECRET`: any long random text (40+ characters, e.g. from a password manager).
   - Push keys: on any computer with Node.js, run `npx web-push generate-vapid-keys` (or `npm run push:keys` in `portal`), then copy the **Public Key** into `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the **Private Key** into `VAPID_PRIVATE_KEY`. Create them **once**: new keys switch notifications off on every phone.
4. Deploy. Then **Settings → Domains → add `order.printamplified.com`** and add the DNS record Vercel shows.

### 4. First management account
Use a demo account on a demo project. For the **live** project, create the first admin once:
1. In Supabase → Authentication → Users → **Invite user**, enter your email. Set a password through the email link.
2. In Supabase → SQL Editor, run (with your email):
   ```sql
   update public.profiles set staff_role = 'pa_admin', full_name = 'Your Name' where email = 'you@printamplified.com';
   ```
3. Sign in, set up 2-step verification, and invite everyone else from the app.

### 5. Optional: backup trigger for push
The app sends pushes right after each action. For extra safety, in Supabase → **Database → Webhooks** create a webhook on **INSERT** into `notifications`, type HTTP POST, URL `https://order.printamplified.com/api/push/dispatch`, with the header `x-push-secret` set to your `PUSH_WEBHOOK_SECRET`.

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

## Going live checklist

Do these in order. Ticking them all usually takes one afternoon.

**A. Try it on a demo first (recommended)**
1. Create a **second, free** Supabase project called *pa-demo*, load it with the demo seed (`npx supabase db push --include-seed`), and deploy a **Preview** on Vercel pointing at it.
2. Click through as each demo account (see [Demo accounts](#demo-accounts-demo-seed-only)) on your own phone: install the app, turn on notifications, reorder, move the order to Delivered as production, record the payment as sales.
3. Optional, automatic: from `portal`, run `E2E_BASE_URL=https://<your-demo-preview-url> npm run e2e`. A robot does the same on a phone-sized and a desktop screen and checks that a reorder takes under 30 seconds. **Never point this at the live app**, because it places real orders.

**B. The live project**
1. Follow [Set-up (one time)](#set-up-one-time) steps 1–4 with a **new** Supabase project (no demo data) and the real domain.
2. On your computer, put the live values in `portal/.env.local` and run `npm run preflight`. It checks the variables, that every database update is applied, that the storage folders are private, that there is no demo data, that 2-step verification is on, and that the payment instructions and inflation table are filled in. Fix every ❌. Then delete `.env.local` from that computer, or keep it somewhere safe.
3. In the app (as management): upload the **logo**, check the **colours**, fill in **payment instructions**, the **email sender**, and **confirm the inflation rates** on the Pricing page.
4. Create the staff accounts, assign account managers, add the first clients and their email domains, and import old records (Import page).
5. Invite one friendly client first. Watch one order go from Submitted to Delivered and Paid, then invite the rest.

**C. After launch**
- Do the weekly [Backups](#backups) (the free Supabase plan has none).
- The free plans have limits. See [What each monthly service costs](#what-each-monthly-service-costs). In particular, **Vercel Hobby is for non-commercial use**, so plan to move to Vercel Pro (about US$20/month) for the business app.
- Every change to the code is checked automatically on GitHub (**Actions → Portal checks**): type check, lint, unit tests, database security tests, a production build and the phone/desktop tests. Merge only when it's green.

---

## What's built so far

**Phase 7 — Phone app and launch kit ✅**
- Installable app: manifest, icons (including Android "maskable" and iPhone home-screen icons), iPhone splash screens, an "Install the app" card (one tap on Android, two-step help on iPhone), and an offline screen.
- A service worker that never caches private pages or data; only the app's own static files.
- Push notifications on installed phones and desktop browsers for every in-app notice, with an on/off switch per device, automatic clean-up of dead subscriptions, and no repeat sends.
- End-to-end tests with Playwright on a phone and a desktop: install, offline, security headers and push-webhook protection run everywhere. The full business flow (reorder under 30 seconds → production → Delivered → Paid → client sees it, plus viewer limits) runs against a demo deployment.
- A go-live preflight check (`npm run preflight`) and automatic checks on GitHub for every change.

**Phase 6 — Order tracking and payments ✅**
- Staff order page: confirm, with an optional price change (VAT and totals recomputed); status updates with notes, client or internal visibility, and production and delivery photos and signed receipts; cancel with a reason.
- Production can move orders along but can't confirm or cancel, and never sees prices or payments. All of this is enforced in the database.
- Payments by bank transfer or cheque with reference, bank, amount, date and notes. Status rolls up automatically (Unpaid → Partially Paid → Paid). Wrong entries are voided with a reason, never deleted.
- Client order page: a five-step progress bar, a timeline with photos, payment history and balance, an optional deposit-slip photo, and cancel while Submitted.
- "Save as agreed prices" after delivery, so the next instant reorder quote starts from the latest price.
- Emails and in-app notices for confirmation, status changes, delivery, cancellations, payments and slips.
- Audit log: filter by area, person and dates, and export to CSV.

**Phase 5 — Past estimates and one-click reorder ✅**
- Past estimates: upload the original (PDF, Excel, Word, scan), a side-by-side check-and-confirm form, a "charge again on reorder" flag, Print Item link or create, and CSV bulk import with originals matched by estimate number.
- Confirming an estimate turns its lines into the item's agreed prices (price history kept; an older estimate never replaces a newer one).
- The instant quote engine (exact decimal maths, compounded and day-prorated inflation, VAT handled once, minimum and cap rules, round-up) with 22 unit tests.
- Pricing page: inflation table (PSA figures pre-filled, "please confirm"), rounding, limits, validity, VAT, breakdown switch, surcharges and add-ons, versioned. Quote preview tool. Agreed prices by hand and staff override with a reason.
- Client one-click reorder: artwork check, price chips per quantity, Same as last order, Reorder now (one confirmed order with colour standard snapshots), a multi-item cart with re-pricing of expired quotes, and Ask for a quote with clear reasons.
- Optional AI auto-fill (Claude API) built but **off**. It needs both the settings switch and an API key.

**Phase 4 — Catalog, new orders and quotes ✅**
- Catalog management: categories, products, photos, client-only products, choices, and standard prices by spec and quantity.
- Client catalog and a four-step order form (specs, quantity, artwork, delivery) with an instant price and saved drafts.
- Orders at a standard price take the price from the price list in the database, never from the browser.
- Quote requests (QR-2026-####) → staff quote builder (total or per-piece, exact maths, validity, VAT) → client **Accept quote** in one tap → confirmed order (with VAT split). Decline with a reason, a question thread, and revised quotes.
- A delivered new order automatically becomes a Print Item with its price.
- Emails and in-app notices for new orders, quote requests, quotes ready, accepted and declined.

**Phase 3 — Review & revise ✅**
- Review Artwork with "Confirm — print as is" or "I have revisions": pins, boxes, comments, attachments per mark, general notes and files (built for phones).
- Editable fields designer (draw boxes; font, size, colour, alignment, max characters, cover colour; font upload) and an instant client-side canvas preview.
- Revision Requests with numbered rounds, a prepress queue, replies per mark, revised proof upload, and a before/after slider or side-by-side view.
- Client approval locks the new version and records name, time and IP. Order status follows along (Waiting for Revisions, then Waiting for Client Approval, then Approved for Print).
- Email and in-app notices for each step.
- Tightened: clients only ever see previews of approved versions and of proofs sent to them.

**Phase 2 — File archive and Print Items ✅**
- Uploads straight from the browser to private storage, with progress, duplicate check (SHA-256) and size and type checks.
- Automatic low-res watermarked previews: PDF and PDF-compatible AI with MuPDF; JPG, PNG and TIFF with sharp. Manual preview image for PSD, EPS, INDD and ZIP.
- Versions, "Approved for Print" with locking enforced in the database, and an approval record (who, when, IP).
- Google Drive links with the warning, "Mark as copied" and a "Drive link only" filter.
- Colour standards with press-sheet photos; structured specs with a spec signature (used for instant quotes in Phase 5).
- Client view-only preview viewer (pages, front/back, zoom, no download); thumbnails everywhere.
- High-res download only for staff, or for clients when management allows it, always audited.
- CSV import of clients and Print Items, plus bulk file upload matched by item code.
- Logo upload; a demo-file seeder.

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
| `npm test` | Unit tests: money, password rules, colours, tokens, spec signatures, CSV rules, and **preview generation** (renders real PDFs and checks size and watermark) |
| `npm run dev`, then open `/dev/lab` | Development-only playground (404 in production) showing the review, markup, live-text, compare and designer screens with real generated previews, without a database |
| `npm run seed:files` | DEMO project only: generates demo artwork PDFs, uploads them and makes all previews |
| `npm run db:local` | Builds a test database on a plain local PostgreSQL: `tests/rls/supabase-shim.sql` (a stand-in for Supabase's `auth`/`storage` schemas, **tests only**), then all migrations, then the seed |
| `npm run test:rls` | Versions and approval rules, plus the **isolation proof**: for every table and bucket, Client A gets 0 rows of Client B; guessed ids; prices hidden from viewers and production; deactivation; 2FA; locked artwork; append-only audit log; invite rules |
| `npm run test:api` | The same proof through the **live Supabase API** with each demo user's own token (set `TEST_SUPABASE_*`) |
| `npm run build` then `npm run e2e` | Playwright on a phone (Pixel 7) and a desktop: manifest, icons, splash screens, service worker, offline screen, security headers. With `E2E_BASE_URL` set to a **demo** deployment, also the main business flows |
| `npm run preflight` | Go-live check of variables, migrations, buckets, demo data and key settings (changes nothing) |
| `npm run push:keys` | Creates the VAPID key pair for push notifications (once) |
| `npm run icons` | Re-creates the app icons and iPhone splash screens from `scripts/make-icons.mjs` |

**Key rules for anyone changing the code**
- All screen text lives in `src/i18n/en.ts`.
- Money: integer **centavos** for amounts, `numeric(14,4)` for unit prices, `decimal.js` in code. Never floats.
- `supabaseServer()` acts as the signed-in user (RLS applies). `supabaseAdmin()` bypasses RLS: use it only on the server, after an explicit permission check.
- New tables need `organization_id`, RLS policies and a line in `tests/rls/isolation.test.ts` (the test already loops over every table automatically).
- Anything that creates a notification should call `kickPush()` (`src/lib/push/send.ts`) so phones get it straight away.
- The service worker (`public/sw.js`) must never cache `/app`, `/staff` or `/api` responses: they are private. Bump `VERSION` in it when you change it.
- Generate typed database types once the Supabase project exists: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
