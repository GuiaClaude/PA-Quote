# User Guide

## The weekly cycle
1. **Monday 08:00 (automatic):** the system syncs the Job Order List and, for every billed project **not marked Paid**,
   prepares one collection email draft with a fresh Statement of Account. Nothing is sent.
2. **Approver:** *Email Approvals → Pending approval.* Open a draft, open/review the attached SOA (*Review SOA*:
   check the internal reconciliation report, then *Mark reviewed*), check recipients, amounts and wording, then
   **Approve**, **Return for correction**, **Place on hold** or **Reject**.
3. **Sender:** *Email Approvals → Approved – awaiting send → Send.* The system re-checks the sheet first. If the project
   was marked Paid in the meantime the email is cancelled; if the balance changed it goes back for approval.
4. The project keeps receiving a weekly draft until it is marked **Paid** in the Job Order List.

## Blocked drafts
A blocked draft lists its reason, e.g. *client has no approved billing email*, *invoice awaiting reconciliation*,
*payment instructions not configured*, *SOA generation failed*. Fix the cause, then *Regenerate from current data*.

## Accounting tasks
* **Job Orders** — search/filter; the detail page shows sheet values, ledger position, collection history, SOAs,
  approvals and changes. Use *Propose sheet update* to change billing fields in the Google Sheet (approved by an approver).
* **Unbilled Control** — delivered projects without invoices, missing amounts/dates, invoices not confirmed sent,
  duplicates and conflicts. Mark milestone-billed jobs *Not yet billable* with a reason.
* **Invoices** — reconcile sheet-derived invoices; *Confirm sent* once delivered to the client.
* **Payments** — *Record payment* (status *claimed*). A different person verifies it. Then *Allocate* to invoices
  (one payment can cover several invoices; the remainder stays as unapplied credit). Bounced cheque → *Reverse*.
* **Adjustments** — request credit notes / debit adjustments; management approves.
* **Clients** — keep approved billing emails, AP contacts and aliases current; generate SOAs for any date
  (*as recorded* reproduces the books on that date; *restated* applies today's knowledge).

## Payment promises
Record on the job order. The next reminder thanks the client for the promise; weekly drafts continue until Paid.

## Edits and approvals
Editing a draft creates a new version and cancels any approval. Recipients can only be addresses on the Client Master.
You cannot approve a draft you created or edited.

## Uncertain sends
If Gmail did not confirm a send, the draft shows *send unknown*. Click *Check Gmail for this send*. If the check
is inconclusive, look in the Sent folder and record the result — never resend until resolved.

## Reports
*Reports* → Daily, Unbilled, Monday run, Weekly management, Monthly. Each exports to PDF, Excel and CSV.
Weekly/monthly reports include a receivables roll-forward check and flag any unexplained difference.
