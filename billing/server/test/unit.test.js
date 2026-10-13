// Pure-function tests: no database or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, formatPHP } from '../lib/money.js';
import { parseSheetDate, mondayOf, manilaDate, addDays, daysBetween } from '../lib/dates.js';
import { parseSheet, resolveColumns, colLetter } from '../domain/sheetParse.js';
import { computeLedger, agingBucket, validateAllocation } from '../domain/ledger.js';
import { buildCollectionEmail, draftContentHash, sendBlockers, chooseTone } from '../domain/emailDraft.js';
import { computeTracking } from '../domain/stage.js';
import { nextMondayRun, MONDAY_CRON, TIMEZONE } from '../scheduler.js';
import { toCSV } from '../lib/export.js';

test('money: parsing and formatting in centavos', () => {
  assert.equal(toCents('₱1,234.56'), 123456);
  assert.equal(toCents('PHP 1,000'), 100000);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('12.345'), 1235);
  assert.equal(toCents('abc'), null);
  assert.equal(toCents(''), null);
  assert.equal(fromCents(-505), '-5.05');
  assert.equal(formatPHP(123456789), 'PHP 1,234,567.89');
});

test('dates: sheet serials, explicit MDY/DMY, Manila calendar', () => {
  assert.equal(parseSheetDate(45658), '2025-01-01');
  assert.equal(parseSheetDate('03/04/2026', 'MDY'), '2026-03-04');
  assert.equal(parseSheetDate('03/04/2026', 'DMY'), '2026-04-03');
  assert.equal(parseSheetDate('Oct 5, 2026'), '2026-10-05');
  assert.equal(parseSheetDate('5-Oct-2026'), '2026-10-05');
  assert.equal(parseSheetDate('13/13/2026'), undefined);
  assert.equal(parseSheetDate(''), null);
  assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // Sunday → previous Monday
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  // 2026-10-11T17:00Z is already Monday 01:00 in Manila
  assert.equal(manilaDate(new Date('2026-10-11T17:00:00Z')), '2026-10-12');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-01-01', '2026-03-01'), 59);
});

test('scheduler: Monday 08:00 Asia/Manila (acceptance #10)', () => {
  assert.equal(MONDAY_CRON, '0 8 * * 1');
  assert.equal(TIMEZONE, 'Asia/Manila');
  // From Tuesday 2026-10-13 → Monday 2026-10-19 08:00 +08:00 = 00:00Z
  assert.equal(nextMondayRun(new Date('2026-10-13T03:00:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
  // Sunday 23:59 UTC is Monday 07:59 Manila → fires one minute later the same Manila Monday
  assert.equal(nextMondayRun(new Date('2026-10-18T23:59:00Z')).toISOString(), '2026-10-19T00:00:00.000Z');
  // Just after it fires → following week
  assert.equal(nextMondayRun(new Date('2026-10-19T00:00:30Z')).toISOString(), '2026-10-26T00:00:00.000Z');
  // Regardless of the host TZ the result is 08:00 in Manila
  const d = nextMondayRun(new Date('2027-03-01T12:00:00Z'));
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d), 'Mon 08:00');
});

test('sheet parsing: mapping validation, blanks, duplicates, missing ids', () => {
  const headers = ['JO', 'Client', 'Status'];
  const cfg = { headerRow: 1, mapping: { jo_number: 'JO', client_name: 'Client', payment_status: 'Status' }, dateOrder: 'MDY' };
  const p = parseSheet([headers, ['A1', 'X', 'Unpaid'], [], ['', '', ''], ['A2', 'Y', 'Paid'], ['A1 ', 'X', 'Paid'], ['', 'Z', 'Unpaid']], cfg);
  assert.equal(p.ok, true);
  assert.equal(p.blank, 2);
  assert.deepEqual(p.rows.map((r) => r.fields.jo_number), ['A2']);
  assert.equal(p.duplicates.length, 1);
  assert.deepEqual(p.duplicates[0].map((r) => r.rowNumber), [2, 6]);
  assert.equal(p.issues[0].kind, 'missing_jo_number');
  assert.equal(p.issues[0].rowNumber, 7);
  const bad = resolveColumns(headers, { jo_number: 'JO', client_name: 'Customer', payment_status: 'Status' });
  assert.match(bad.errors[0], /Customer/);
  const missing = resolveColumns(headers, { jo_number: 'JO' });
  assert.ok(missing.errors.some((e) => /Payment status/.test(e)));
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(26), 'AA');
});

const inv = (id, amount, date, due, extra = {}) => ({ id, invoice_number: `INV-${id}`, client_id: 1, invoice_date: date, due_date: due, amount, status: 'issued', ...extra });
const pay = (id, amount, date, verifiedAt, extra = {}) => ({ id, client_id: 1, payment_date: date, amount, status: verifiedAt ? 'verified' : 'claimed', verified_at: verifiedAt, ...extra });
const alloc = (id, paymentId, invoiceId, amount, date, createdAt, extra = {}) => ({ id, payment_id: paymentId, invoice_id: invoiceId, amount, effective_date: date, status: 'active', created_at: createdAt, ...extra });

test('ledger: partial payments, unverified claims, unapplied credits (acceptance #6, #7)', () => {
  const data = {
    invoices: [inv(1, '10000.00', '2026-08-01', '2026-08-31'), inv(2, '5000.00', '2026-09-01', '2026-10-01')],
    payments: [pay(1, '7000.00', '2026-09-10', '2026-09-10T02:00:00Z'), pay(2, '3000.00', '2026-09-20', null)],
    allocations: [alloc(1, 1, 1, '4000.00', '2026-09-10', '2026-09-10T03:00:00Z'), alloc(2, 1, 2, '2000.00', '2026-09-10', '2026-09-10T03:00:00Z')],
    adjustments: [],
  };
  const l = computeLedger(data, '2026-10-13');
  const [a, b] = l.invoices;
  assert.equal(a.outstanding, 600000);
  assert.equal(b.outstanding, 300000);
  assert.equal(l.totals.outstanding, 900000);
  assert.equal(l.totals.unapplied, 100000);       // 7000 − 4000 − 2000
  assert.equal(l.totals.unverifiedClaims, 300000); // claimed, NOT deducted
  assert.equal(a.daysOverdue, 43);
  assert.equal(l.totals.d31_60, 600000);
  assert.equal(l.totals.d1_30, 300000);
});

test('ledger: adjustments and historical as-of dates (acceptance #9)', () => {
  const data = {
    invoices: [inv(1, '10000.00', '2026-08-01', '2026-08-31')],
    payments: [
      pay(1, '2000.00', '2026-09-01', '2026-09-05T02:00:00Z'),
      pay(2, '1000.00', '2026-09-02', '2026-09-02T02:00:00Z', { status: 'reversed', reversed_at: '2026-09-20T02:00:00Z' }),
    ],
    allocations: [
      alloc(1, 1, 1, '2000.00', '2026-09-01', '2026-09-05T03:00:00Z'),
      alloc(2, 2, 1, '1000.00', '2026-09-02', '2026-09-02T03:00:00Z', { status: 'reversed', reversed_at: '2026-09-20T02:00:00Z' }),
    ],
    adjustments: [
      { id: 1, invoice_id: 1, kind: 'credit_note', amount: '500.00', effective_date: '2026-09-15', status: 'approved', decided_at: '2026-09-15T02:00:00Z' },
      { id: 2, invoice_id: 1, kind: 'debit', amount: '300.00', effective_date: '2026-09-16', status: 'pending', decided_at: null },
    ],
  };
  const out = (asOf, basis) => computeLedger(data, asOf, basis).invoices[0].outstanding;
  assert.equal(out('2026-09-03', 'as_known'), 900000);  // only the later-reversed 1000 known & verified by then
  assert.equal(out('2026-09-03', 'restated'), 800000);  // today's knowledge: 2000 verified, 1000 reversed
  assert.equal(out('2026-09-10', 'as_known'), 700000);  // both counted (reversal not yet happened)
  assert.equal(out('2026-09-30', 'as_known'), 750000);  // reversal + credit note; pending debit ignored
  assert.equal(computeLedger(data, '2026-07-31').invoices.length, 0); // invoice did not exist yet
});

test('ledger: aging buckets and allocation validation', () => {
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(30), 'd1_30');
  assert.equal(agingBucket(31), 'd31_60');
  assert.equal(agingBucket(90), 'd61_90');
  assert.equal(agingBucket(91), 'd90_plus');
  assert.match(validateAllocation({ paymentAmount: 1000, paymentAllocated: 600, invoiceOutstanding: 5000, amount: 500 }), /unallocated/);
  assert.match(validateAllocation({ paymentAmount: 1000, paymentAllocated: 0, invoiceOutstanding: 300, amount: 500 }), /outstanding/);
  assert.equal(validateAllocation({ paymentAmount: 1000, paymentAllocated: 0, invoiceOutstanding: 3000, amount: 500 }), null);
});

const client = { id: 1, registered_name: 'TEST Co', approved_billing_email: 'ap@test.invalid', additional_recipients: [], ap_contact_name: 'TEST AP' };
const balance = { hasLedger: true, unreconciled: [], original: 1000000, paid: 400000, credits: 0, debits: 0, outstanding: 600000, overdue: 600000, maxDaysOverdue: 12,
  invoices: [{ invoiceNumber: 'INV-1', invoiceDate: '2026-09-01', dueDate: '2026-10-01', original: 1000000, outstanding: 600000, daysOverdue: 12 }] };
const soa = { id: 9, statement_number: 'SOA-T-20261013', version: 1, statement_date: '2026-10-13', pdf_sha256: 'abc' };

test('email draft: verified data only; missing data blocks instead of being invented', () => {
  const e = buildCollectionEmail({ company: { name: 'Print Amplified OPC' }, client, jobOrders: [{ jo_number: 'JO-1' }], balance, soa, instructions: 'TEST instructions', promise: null, priorSent: 0, asOf: '2026-10-13' });
  assert.deepEqual(e.blockedReasons, []);
  assert.deepEqual(e.to, ['ap@test.invalid']);
  assert.match(e.body, /INV-1/);
  assert.match(e.body, /PHP 6,000\.00/);
  assert.match(e.body, /12 days overdue/);
  assert.match(e.body, /TEST instructions/);
  const noEmail = buildCollectionEmail({ company: {}, client: { ...client, approved_billing_email: null }, jobOrders: [{ jo_number: 'JO-1' }], balance, soa, instructions: '', asOf: '2026-10-13' });
  assert.equal(noEmail.to.length, 0);
  assert.ok(noEmail.blockedReasons.some((r) => /billing email/.test(r)));
  assert.ok(noEmail.blockedReasons.some((r) => /payment instructions/.test(r)));
  const promised = buildCollectionEmail({ company: {}, client, jobOrders: [{ jo_number: 'JO-1' }], balance, soa, instructions: 'x', promise: { promised_date: '2026-10-20', amount: 600000 }, asOf: '2026-10-13' });
  assert.match(promised.body, /scheduled for 2026-10-20/);
  assert.equal(chooseTone(0, 0), 'courtesy');
  assert.equal(chooseTone(120, 0), 'escalation');
});

test('approval gate: hash covers recipients, amounts, statement and body (acceptance #15, #16)', () => {
  const base = { to: ['a@x.invalid'], cc: [], subject: 'S', body: 'B', soaId: 1, soaPdfSha256: 'h', amounts: { outstanding: 100 } };
  const h = draftContentHash(base);
  assert.notEqual(draftContentHash({ ...base, to: ['b@x.invalid'] }), h);
  assert.notEqual(draftContentHash({ ...base, amounts: { outstanding: 101 } }), h);
  assert.notEqual(draftContentHash({ ...base, soaId: 2 }), h);
  assert.notEqual(draftContentHash({ ...base, soaPdfSha256: 'other' }), h);
  assert.notEqual(draftContentHash({ ...base, body: 'B2' }), h);
  assert.equal(draftContentHash({ ...base, to: ['A@X.invalid'] }), h); // case-insensitive addresses
  const draft = { status: 'approved', version: 2, content_hash: h, to_recipients: ['a@x.invalid'] };
  const approval = { decision: 'approve', draft_version: 2, content_hash: h, expires_at: new Date(Date.now() + 3600e3).toISOString() };
  const sender = { roles: ['sender'] };
  const okSoa = { status: 'reviewed' };
  assert.deepEqual(sendBlockers({ draft, approval, soa: okSoa, currentHash: h, sender }), []);
  assert.ok(sendBlockers({ draft, approval: null, soa: okSoa, currentHash: h, sender }).length);
  assert.ok(sendBlockers({ draft, approval, soa: okSoa, currentHash: 'changed', sender }).some((r) => /changed/.test(r)));
  assert.ok(sendBlockers({ draft, approval: { ...approval, draft_version: 1 }, soa: okSoa, currentHash: h, sender }).length);
  assert.ok(sendBlockers({ draft, approval: { ...approval, expires_at: '2000-01-01' }, soa: okSoa, currentHash: h, sender }).some((r) => /expired/.test(r)));
  assert.ok(sendBlockers({ draft, approval, soa: { status: 'pending_review' }, currentHash: h, sender }).length);
  assert.ok(sendBlockers({ draft, approval, soa: okSoa, currentHash: h, sender: { roles: ['sysadmin', 'approver'] } }).some((r) => /Sender/.test(r)));
  assert.ok(sendBlockers({ draft: { ...draft, status: 'pending_approval' }, approval, soa: okSoa, currentHash: h, sender }).length);
});

test('tracking: stages are derived and flags overlap', () => {
  const cfg = { deliveredValues: ['Delivered'], completedValues: [], partiallyPaidValues: [], cancelledValues: ['Cancelled'], onHoldValues: [], disputedValues: ['Disputed'] };
  const jo = { delivery_status: 'Delivered', invoice_number_source: 'INV-1', is_paid_in_source: false, billable_status: 'per_source', payment_status_source: 'Unpaid' };
  const t = computeTracking(jo, { balance: { ...balance, paid: 0 }, invoiceSent: true, sheetCfg: cfg, asOf: '2026-10-13' });
  assert.equal(t.stage, 'Awaiting Payment');
  assert.ok(t.flags.delivered && t.flags.billed && t.flags.overdue);
  assert.equal(computeTracking({ ...jo, invoice_number_source: null }, { balance: { hasLedger: false }, invoiceSent: false, sheetCfg: cfg, asOf: '2026-10-13' }).stage, 'Awaiting Billing');
  assert.equal(computeTracking({ ...jo, payment_status_source: 'Disputed' }, { balance, invoiceSent: true, sheetCfg: cfg, asOf: '2026-10-13' }).exception, 'Disputed');
  assert.equal(computeTracking({ ...jo, is_paid_in_source: true }, { balance, invoiceSent: true, sheetCfg: cfg, asOf: '2026-10-13' }).stage, 'Paid');
});

test('CSV export neutralises formula injection', () => {
  const csv = toCSV({ title: 'T', asOf: '2026-10-13', sections: [{ title: 'S', columns: [{ key: 'a', label: 'A' }, { key: 'm', label: 'M', money: true }], rows: [{ a: '=HYPERLINK("x")', m: -150 }] }] });
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,-1\.50/);
});
