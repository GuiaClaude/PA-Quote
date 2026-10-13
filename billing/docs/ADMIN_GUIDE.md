# Administrator Guide

## Roles
| Role | Can | Cannot |
|---|---|---|
| **accounting** | Sync, edit app fields, propose sheet updates, manage clients, reconcile invoices, record/allocate payments, request adjustments, generate SOAs, create/edit/regenerate drafts | Approve their own drafts, verify their own payments |
| **approver** | Review SOAs, approve/return/reject/hold drafts, apply/reject sheet updates, verify/reverse payments, resolve unknown sends | Approve drafts they created or edited |
| **sender** | Send approved, unchanged, unexpired drafts | Send anything not approved |
| **management** | Dashboards & reports, approve adjustments, void invoices, resolve disputes/exceptions | — |
| **sysadmin** | Connections, mapping, settings, users & roles | Approve or send (unless also given those roles — audited) |

Give each person the fewest roles needed. Role changes are recorded in the audit trail (`user.permissions_changed`).

## Settings
* **Connections** — connection status, account, scopes, last sync, last/next Monday run, errors; Reconnect / Test / Disconnect.
* **Spreadsheet & column mapping** — see DEPLOYMENT §3. If staff rename or move a mapped column, sync fails with
  "Mapped header … was not found": update the mapping. Rows can be sorted, filtered, inserted or moved freely.
* **Status conventions** — exact (case-insensitive) cell values. Only values listed under *Paid* stop weekly drafts.
* **Company & payment instructions** — appear on every SOA and email; drafts are blocked while blank.
* **Policies** — approval expiry, disputed/on-hold handling, reminders before due date, stale-sync threshold, sync
  schedule, internal reviewer notification emails, self-approval exception (off by default; audited if on).

## Monitoring checklist (weekly)
1. Monday Runs: this week's run `succeeded`. If `failed`, read the error, fix (usually sync/mapping), click *Run / resume*.
2. Exceptions: no open `critical` items (duplicate JO numbers, paid-with-balance, invoice client mismatch).
3. Email Approvals → *Uncertain sends*: must be empty.
4. Settings → Connections: no new integration errors; sync not stale.

## Exception types
| Kind | Meaning / action |
|---|---|
| `duplicate_jo_in_source` | Same JO number on several rows — fix the sheet; rows are not imported until resolved. |
| `missing_jo_number` | Row with data but no JO number — fix the sheet. |
| `removed_from_source` | JO no longer in the tab — restore or confirm; excluded from collection meanwhile. |
| `unmatched_client` | Add an alias on the right client (validated match). |
| `paid_with_ledger_balance` | Sheet says Paid, ledger shows a balance — record/verify the payment or correct the sheet. Routine drafts suspended. |
| `ledger_settled_source_unpaid` | Ledger is settled but sheet not Paid — update the sheet's payment status. |
| `invoice_multi_jo` / `invoice_source_mismatch` / `duplicate_invoice_number` / `invoice_client_mismatch` | Confirm the correct invoice data, then reconcile. |
| `collection_review_required` | Disputed/on-hold project skipped by the Monday run. |

Sync-detected exceptions close automatically once the condition disappears; others require a resolution note.
