// Builds a collection email from verified data only. Anything missing becomes a blocking reason —
// recipients, amounts, references and payment instructions are never invented.
import { formatPHP } from '../lib/money.js';
import { sha256, stableStringify } from '../lib/crypto.js';

export function chooseTone(maxDaysOverdue, priorSent) {
  if (maxDaysOverdue <= 0) return 'courtesy';
  if (maxDaysOverdue <= 30) return priorSent >= 3 ? 'follow_up' : 'reminder';
  if (maxDaysOverdue <= 90) return 'follow_up';
  return 'escalation';
}

const OPENERS = {
  courtesy: 'This is a courtesy reminder regarding the invoice below, which will fall due soon.',
  reminder: 'We hope all is well. Our records show that the invoice below is now past due.',
  follow_up: 'We are following up on the invoice below, which remains outstanding on your account.',
  escalation: 'We are writing again about the invoice below, which has been outstanding for an extended period. We would value your help in bringing this account up to date.',
};

export function buildCollectionEmail({ company, client, jobOrders, balance, soa, instructions, promise, priorSent, asOf }) {
  const blocked = [];
  const to = client?.approved_billing_email ? [client.approved_billing_email] : [];
  const cc = client?.additional_recipients || [];
  if (!client) blocked.push('Job order is not linked to a verified Client Master record');
  else if (!to.length) blocked.push('Client has no approved billing email address');
  if (!instructions || !String(instructions).trim()) blocked.push('Approved payment instructions are not configured');
  if (!balance?.hasLedger) blocked.push('No reconciled invoice in the ledger for this job order');
  if (balance?.unreconciled?.length) blocked.push(`Invoice(s) awaiting reconciliation: ${balance.unreconciled.map((i) => i.invoice_number).join(', ')}`);
  if (!soa) blocked.push('Statement of Account could not be generated');

  const lines = balance?.invoices?.filter((l) => l.outstanding > 0) || [];
  const joNums = jobOrders.map((j) => j.jo_number).join(', ');
  const tone = chooseTone(balance?.maxDaysOverdue || 0, priorSent || 0);
  const amounts = {
    original: balance?.original ?? null, paymentsAndCredits: balance ? (balance.paid + balance.credits - balance.debits) : null,
    outstanding: balance?.outstanding ?? null, overdue: balance?.overdue ?? null, asOf,
    invoices: lines.map((l) => ({ number: l.invoiceNumber, date: l.invoiceDate, due: l.dueDate, original: l.original, outstanding: l.outstanding, daysOverdue: l.daysOverdue })),
  };
  if (balance?.hasLedger && !(balance.outstanding > 0)) blocked.push('Ledger shows no outstanding balance for this job order');

  const name = client?.ap_contact_name || client?.billing_contact;
  const greeting = name ? `Dear ${name},` : 'Dear Accounts Payable Team,';
  const invRefs = lines.map((l) => l.invoiceNumber).join(', ') || '(invoice pending reconciliation)';
  const subject = `${tone === 'courtesy' ? 'Payment reminder' : 'Statement of Account'} – ${client?.trade_name || client?.registered_name || 'Account'} – JO ${joNums} / Invoice ${invRefs}`;

  const body = [];
  body.push(greeting, '');
  body.push(`Good day from ${company?.name || 'Print Amplified OPC'}.`, '');
  body.push(OPENERS[tone], '');
  for (const l of lines) {
    body.push(`  Job Order No.:      ${joNums}`);
    body.push(`  Invoice No.:        ${l.invoiceNumber} dated ${l.invoiceDate}`);
    body.push(`  Due date:           ${l.dueDate}${l.daysOverdue > 0 ? ` (${l.daysOverdue} days overdue)` : ''}`);
    body.push(`  Original amount:    ${formatPHP(l.original)}`);
    body.push(`  Payments/credits:   ${formatPHP(l.original - l.outstanding)}`);
    body.push(`  Outstanding:        ${formatPHP(l.outstanding)}`, '');
  }
  if (lines.length > 1) body.push(`  Total outstanding for this job order: ${formatPHP(amounts.outstanding)}`, '');
  if (amounts.overdue > 0) body.push(`Of this, ${formatPHP(amounts.overdue)} is past due.`, '');
  if (promise) {
    body.push(`Thank you for letting us know that payment${promise.amount ? ` of ${formatPHP(promise.amount)}` : ''} is scheduled for ${promise.promised_date}. We are sending this weekly update for your reference until the account is settled; please disregard it if payment is already on its way.`, '');
  }
  if (soa) body.push(`Attached is your Statement of Account (${soa.statement_number}${soa.version > 1 ? ` v${soa.version}` : ''}) as of ${soa.statement_date} for your reference.`, '');
  body.push('Payment instructions:', String(instructions || '').trim(), '');
  body.push('If payment has already been made, kindly reply with the payment details (date, amount and reference) so we can update our records. If any item does not match your records, please let us know and we will gladly reconcile.', '');
  body.push('Thank you very much.', '', 'Sincerely,', `${company?.name || 'Print Amplified OPC'} – Accounts Receivable`);
  if (company?.phone || company?.email) body.push([company.phone, company.email].filter(Boolean).join(' | '));

  return { to, cc, subject, body: body.join('\n'), tone, amounts, blockedReasons: blocked };
}

/** Hash of every material element. Any change → previous approval no longer matches. */
export function draftContentHash({ to, cc, subject, body, soaId, soaPdfSha256, amounts }) {
  return sha256(stableStringify({
    to: [...to].map((x) => x.toLowerCase()).sort(), cc: [...cc].map((x) => x.toLowerCase()).sort(),
    subject, body: body.replace(/\r\n/g, '\n'), soaId: soaId ?? null, soaPdfSha256: soaPdfSha256 ?? null,
    amounts: amounts ? { original: amounts.original, outstanding: amounts.outstanding, overdue: amounts.overdue, paymentsAndCredits: amounts.paymentsAndCredits, invoices: amounts.invoices } : null,
  }));
}

/**
 * Server-side send gate. Returns [] when sendable, otherwise reasons.
 */
export function sendBlockers({ draft, approval, soa, currentHash, sender, now = new Date() }) {
  const r = [];
  if (!sender.roles.includes('sender')) r.push('User does not hold the Authorized Sender role');
  if (draft.status !== 'approved' && draft.status !== 'send_failed') r.push(`Draft status is ${draft.status}`);
  if (!approval) r.push('No valid approval on record');
  else {
    if (approval.decision !== 'approve') r.push('Latest decision is not an approval');
    if (approval.invalidated_at) r.push(`Approval was invalidated: ${approval.invalidated_reason}`);
    if (approval.draft_version !== draft.version) r.push('Approval was given for a different version of the draft');
    if (approval.content_hash !== currentHash || draft.content_hash !== currentHash) r.push('Draft content changed after approval');
    if (approval.expires_at && new Date(approval.expires_at) < now) r.push('Approval has expired');
  }
  if (!soa) r.push('No Statement of Account attached');
  else if (soa.status !== 'reviewed') r.push('Attached Statement of Account is not reviewed');
  if (!draft.to_recipients?.length) r.push('No recipient');
  return r;
}
