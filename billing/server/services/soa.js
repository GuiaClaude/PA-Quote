import { query, tx } from '../db.js';
import { buildStatementModel } from '../domain/soa.js';
import { clientLedger } from './ledger.js';
import { getSetting } from './settings.js';
import { renderPdf, table } from '../lib/pdf.js';
import { formatPHP, toCents } from '../lib/money.js';
import { sha256 } from '../lib/crypto.js';
import { manilaDate, isValidDateStr } from '../lib/dates.js';
import { audit, SYSTEM } from './audit.js';
import { raiseException } from './exceptions.js';
import { getIntegrations } from '../google/index.js';
import { AppError, badRequest, conflict, notFound, forbidden } from '../lib/errors.js';

export async function jobOrdersByInvoice(db, invoiceIds) {
  if (!invoiceIds.length) return new Map();
  const { rows } = await (db || { query }).query(
    `SELECT ij.invoice_id, j.id, j.jo_number, j.project_name, j.description FROM invoice_job_orders ij JOIN job_orders j ON j.id=ij.job_order_id
     WHERE ij.invoice_id = ANY($1) ORDER BY j.jo_number`, [invoiceIds]);
  const m = new Map();
  for (const r of rows) m.set(r.invoice_id, [...(m.get(r.invoice_id) || []), r]);
  return m;
}

/**
 * Internal reconciliation report: compares the Job Order List (master status) with the ledger.
 * Discrepancies are flagged — neither source is altered.
 */
export async function reconciliationReport(db, clientId, ledger) {
  const q = db || { query };
  const { rows: jos } = await q.query(
    `SELECT j.*, array_remove(array_agg(i.id), NULL) AS invoice_ids, array_remove(array_agg(i.status), NULL) AS invoice_statuses
       FROM job_orders j LEFT JOIN invoice_job_orders ij ON ij.job_order_id=j.id LEFT JOIN invoices i ON i.id=ij.invoice_id AND i.status<>'void'
      WHERE j.client_id=$1 AND j.source_present GROUP BY j.id ORDER BY j.jo_number`, [clientId]);
  const lineById = new Map(ledger.invoices.map((l) => [l.invoiceId, l]));
  const discrepancies = [];
  const rows = [];
  for (const j of jos) {
    const lines = j.invoice_ids.map((id) => lineById.get(id)).filter(Boolean);
    const unrec = j.invoice_statuses.filter((s) => s === 'unreconciled').length;
    const ledgerOutstanding = lines.reduce((s, l) => s + l.outstanding, 0);
    const row = { jo: j.jo_number, sourcePaymentStatus: j.payment_status_source, paidInSource: j.is_paid_in_source,
      sheetBillingAmount: toCents(j.billing_amount_source), sheetInvoice: j.invoice_number_source, ledgerInvoices: lines.map((l) => l.invoiceNumber),
      ledgerOutstanding: lines.length ? ledgerOutstanding : null, unreconciledInvoices: unrec };
    rows.push(row);
    if (j.is_paid_in_source && ledgerOutstanding > 0) discrepancies.push({ kind: 'paid_in_source_balance_in_ledger', jo: j.jo_number, jobOrderId: j.id, amount: ledgerOutstanding, invoices: row.ledgerInvoices });
    if (!j.is_paid_in_source && lines.length && ledgerOutstanding <= 0 && !unrec) discrepancies.push({ kind: 'ledger_settled_source_unpaid', jo: j.jo_number, jobOrderId: j.id, invoices: row.ledgerInvoices });
    if (unrec) discrepancies.push({ kind: 'unreconciled_invoice', jo: j.jo_number, jobOrderId: j.id, invoice: j.invoice_number_source, note: 'Excluded from statement until reconciled' });
    if (lines.length === 1 && row.sheetBillingAmount != null && lines[0].original !== row.sheetBillingAmount) {
      const { rows: [{ n }] } = await q.query('SELECT count(*)::int n FROM invoice_job_orders WHERE invoice_id=$1', [lines[0].invoiceId]);
      if (n === 1) discrepancies.push({ kind: 'amount_mismatch', jo: j.jo_number, jobOrderId: j.id, sheet: row.sheetBillingAmount, ledger: lines[0].original });
    }
    if (j.invoice_number_source == null && lines.length === 0 && !j.is_paid_in_source && j.exception_state !== 'cancelled') {
      // Not a discrepancy by itself; listed for unbilled control.
    }
  }
  return {
    clientId, asOf: ledger.asOf, jobOrders: rows, discrepancies,
    unverifiedClaims: ledger.unverified, unapplied: ledger.unapplied,
    ledgerTotals: ledger.totals,
  };
}

async function nextVersion(db, statementNumber) {
  const { rows: [{ v }] } = await db.query('SELECT COALESCE(max(version),0)+1 AS v FROM soa_statements WHERE statement_number=$1', [statementNumber]);
  return v;
}

export async function generateSoa({ clientId, statementDate = manilaDate(), mode = 'outstanding', basis = 'as_known', actor = SYSTEM }) {
  if (!isValidDateStr(statementDate)) throw badRequest('Invalid statement date');
  if (!['outstanding', 'full_history'].includes(mode)) throw badRequest('Invalid mode');
  const { rows: [client] } = await query('SELECT * FROM clients WHERE id=$1', [clientId]);
  if (!client) throw notFound('Client not found');
  const company = await getSetting('company');
  const instructions = client.payment_instructions || (await getSetting('paymentInstructions'));
  if (!instructions || !String(instructions).trim()) throw new AppError(422, 'Approved payment instructions are not configured (Settings → Company & payment instructions)');

  const ledger = await clientLedger(clientId, statementDate, basis);
  const joMap = await jobOrdersByInvoice(null, ledger.invoices.map((l) => l.invoiceId));
  const model = buildStatementModel({ client, ledger, jobOrdersByInvoice: joMap, mode });
  const recon = await reconciliationReport(null, clientId, ledger);
  const hasDiscrepancy = recon.discrepancies.length > 0;
  for (const d of recon.discrepancies.filter((x) => x.kind === 'paid_in_source_balance_in_ledger')) {
    await raiseException(null, { kind: 'paid_with_ledger_balance', key: d.jo, jobOrderId: d.jobOrderId, clientId, severity: 'critical',
      message: `JO ${d.jo} is marked Paid in the Job Order List but the ledger shows ${formatPHP(d.amount)} outstanding (${d.invoices.join(', ')}).` });
  }

  const statementNumber = `SOA-${client.client_code}-${statementDate.replace(/-/g, '')}${mode === 'full_history' ? '-H' : ''}`;
  return tx(async (db) => {
    const version = await nextVersion(db, statementNumber);
    const pdf = await renderSoaPdf({ company, client, statementNumber, version, statementDate, model, instructions, recon, mode, basis });
    await db.query(`UPDATE soa_statements SET status='superseded' WHERE client_id=$1 AND statement_number=$2 AND status='pending_review'`, [clientId, statementNumber]);
    const { rows: [soa] } = await db.query(
      `INSERT INTO soa_statements(statement_number, version, client_id, statement_date, mode, basis, content_hash, totals, lines, included_refs, recon_report, has_discrepancy, pdf, pdf_sha256, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, statement_number, version, status, content_hash, has_discrepancy, totals, pdf_sha256`,
      [statementNumber, version, clientId, statementDate, mode, basis, model.contentHash, JSON.stringify(model.totals), JSON.stringify(model.lines),
        JSON.stringify(model.includedRefs), JSON.stringify(recon), hasDiscrepancy, pdf, sha256(pdf), actor.id ?? null]);
    await audit(db, actor, 'soa.generated', 'soa', `${statementNumber} v${version}`, { after: { totals: model.totals, hasDiscrepancy, lines: model.lines.length }, related: { soaId: soa.id } });
    return soa;
  });
}

async function uploadToDrive(soa) {
  const { drive } = await getIntegrations();
  const folderId = await getSetting('soaFolderId');
  if (!drive) return { error: 'Google Drive is not connected' };
  if (!folderId) return { error: 'SOA storage folder is not configured' };
  try {
    const f = await drive.uploadPdf({ folderId, name: `${soa.statement_number} v${soa.version}.pdf`, buffer: soa.pdf,
      appProperties: { soaId: String(soa.id), sha256: soa.pdf_sha256 } });
    await query('UPDATE soa_statements SET drive_file_id=$2, drive_web_link=$3, drive_error=NULL WHERE id=$1', [soa.id, f.id, f.webViewLink || null]);
    return { fileId: f.id };
  } catch (e) {
    await query('UPDATE soa_statements SET drive_error=$2 WHERE id=$1', [soa.id, e.message]);
    return { error: e.message };
  }
}

/**
 * Review = financial sign-off of the statement. Only reviewed statements can be attached to emails.
 * The PDF is stored in the designated Drive folder as part of review.
 */
export async function reviewSoa(id, { approve, note, acknowledgeDiscrepancy }, actor) {
  const { rows: [soa] } = await query('SELECT * FROM soa_statements WHERE id=$1', [id]);
  if (!soa) throw notFound();
  if (soa.status !== 'pending_review') throw conflict(`Statement is ${soa.status}`);
  if (soa.generated_by && soa.generated_by === actor.id) throw forbidden('The person who generated a statement cannot review it');
  if (!approve) {
    await query(`UPDATE soa_statements SET status='rejected', reviewed_by=$2, reviewed_at=now(), review_note=$3 WHERE id=$1`, [id, actor.id, note || null]);
    await audit(null, actor, 'soa.rejected', 'soa', `${soa.statement_number} v${soa.version}`, { reason: note });
    return { status: 'rejected' };
  }
  if (soa.has_discrepancy && !acknowledgeDiscrepancy) throw conflict('This statement has reconciliation discrepancies. Resolve them or explicitly acknowledge the disclosed discrepancies.', { discrepancies: soa.recon_report.discrepancies });
  if (soa.recon_report.discrepancies.some((d) => d.kind === 'paid_in_source_balance_in_ledger')) throw conflict('A job order is marked Paid in the sheet while the ledger shows a balance. Resolve this before issuing a statement.');
  const up = soa.drive_file_id ? { fileId: soa.drive_file_id } : await uploadToDrive(soa);
  if (up.error) throw new AppError(503, `Statement could not be stored in Google Drive: ${up.error}`);
  await query(`UPDATE soa_statements SET status='reviewed', reviewed_by=$2, reviewed_at=now(), review_note=$3 WHERE id=$1`, [id, actor.id, note || null]);
  await audit(null, actor, 'soa.reviewed', 'soa', `${soa.statement_number} v${soa.version}`, { after: { driveFileId: up.fileId, acknowledgeDiscrepancy: !!acknowledgeDiscrepancy }, reason: note });
  return { status: 'reviewed', driveFileId: up.fileId };
}

// ───────────────────────── PDF ─────────────────────────

function renderSoaPdf({ company, client, statementNumber, version, statementDate, model, instructions, recon, mode, basis }) {
  return renderPdf((doc) => {
    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#E0295A').text(company.name || 'Print Amplified OPC', L, 36);
    doc.fillColor('#000').font('Helvetica').fontSize(8);
    [company.address, [company.phone, company.email].filter(Boolean).join('  ·  '), company.tin ? `TIN ${company.tin}` : ''].filter(Boolean).forEach((t) => doc.text(t));
    doc.font('Helvetica-Bold').fontSize(14).text('STATEMENT OF ACCOUNT', L, 36, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9)
      .text(`Statement No.: ${statementNumber}${version > 1 ? ` (v${version})` : ''}`, { width: W, align: 'right' })
      .text(`Statement Date: ${statementDate}`, { width: W, align: 'right' })
      .text(mode === 'full_history' ? 'Full account history' : 'Outstanding items', { width: W, align: 'right' });
    doc.moveDown(1.2);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text('BILL TO', L, y);
    doc.font('Helvetica').text(client.registered_name).text(client.trade_name && client.trade_name !== client.registered_name ? `(${client.trade_name})` : '')
      .text(client.billing_address || '');
    doc.font('Helvetica-Bold').text('ACCOUNTS PAYABLE', L + W / 2, y);
    doc.font('Helvetica').text(client.ap_contact_name || client.billing_contact || '', L + W / 2).text(client.approved_billing_email || '', L + W / 2)
      .text(client.payment_terms_days != null ? `Payment terms: ${client.payment_terms_days} days` : '', L + W / 2);
    doc.x = L;
    doc.moveDown(1);

    table(doc, [
      { key: 'invoiceDate', label: 'Invoice Date', width: 62 },
      { key: 'invoiceNumber', label: 'Invoice No.', width: 70 },
      { key: 'jobOrders', label: 'Job Order No.', width: 80 },
      { key: 'description', label: 'Project Description', width: 190 },
      { key: 'dueDate', label: 'Due Date', width: 62 },
      { key: 'original', label: 'Original Amount', width: 80, money: true },
      { key: 'paymentsAndCredits', label: 'Payments/Credits', width: 80, money: true },
      { key: 'outstanding', label: 'Outstanding', width: 80, money: true },
      { key: 'daysOverdue', label: 'Days Overdue', width: 55, align: 'right' },
    ], model.lines.length ? model.lines : [{ description: 'No outstanding items as of the statement date.' }]);

    doc.moveDown(1);
    const t = model.totals;
    const sumRows = [
      ['Total outstanding balance', t.outstanding], ['Not yet due', t.notYetDue], ['Total overdue', t.overdue],
      ['  1–30 days overdue', t.d1_30], ['  31–60 days overdue', t.d31_60], ['  61–90 days overdue', t.d61_90], ['  More than 90 days overdue', t.d90_plus],
    ];
    if (t.unapplied > 0) sumRows.push(['Unapplied payments/credits on account (not deducted above)', t.unapplied]);
    if (doc.y > doc.page.height - 220) doc.addPage();
    const sy = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text('SUMMARY', L, sy);
    doc.font('Helvetica').fontSize(9);
    for (const [label, v] of sumRows) {
      const ly = doc.y;
      doc.text(label, L, ly, { width: 260 });
      doc.text(formatPHP(v), L + 260, ly, { width: 110, align: 'right' });
    }
    doc.font('Helvetica-Bold').fontSize(10).text('PAYMENT INSTRUCTIONS', L + 420, sy);
    doc.font('Helvetica').fontSize(9).text(instructions, L + 420, doc.y, { width: W - 420 });
    doc.x = L;
    doc.y = Math.max(doc.y, sy + 120);
    doc.moveDown(1);
    const disclosed = recon.discrepancies.filter((d) => d.kind !== 'unreconciled_invoice');
    if (disclosed.length) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#b00020')
        .text(`Note: Some items on this account are under reconciliation and may be revised: ${[...new Set(disclosed.flatMap((d) => d.invoices || [d.jo]))].join(', ')}.`, { width: W });
      doc.fillColor('#000');
    }
    doc.font('Helvetica').fontSize(9).moveDown(0.5).text(
      'We would appreciate settlement of the overdue balance at your earliest convenience. If your records differ from this statement, or payment has already been made, kindly send us the payment details so we can reconcile your account. Thank you for your continued business.',
      { width: W });
    doc.fontSize(7).fillColor('#666').moveDown(0.5).text(`Balances ${basis === 'as_known' ? 'as recorded' : 'as restated'} on ${statementDate}. Unverified payment advices are not reflected until confirmed.`, { width: W });
  });
}

export async function getSoaPdf(id) {
  const { rows: [s] } = await query('SELECT statement_number, version, pdf FROM soa_statements WHERE id=$1', [id]);
  if (!s) throw notFound();
  return s;
}
