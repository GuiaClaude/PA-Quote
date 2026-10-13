import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { query } from './db.js';
import { AppError, badRequest, forbidden, notFound } from './lib/errors.js';
import { randomToken } from './lib/crypto.js';
import { manilaDate, isValidDateStr } from './lib/dates.js';
import { toCents, fromCents } from './lib/money.js';
import { audit, userActor } from './services/audit.js';
import * as auth from './services/auth.js';
import * as settings from './services/settings.js';
import * as sync from './services/sync.js';
import * as ledger from './services/ledger.js';
import * as soa from './services/soa.js';
import * as email from './services/email.js';
import * as collection from './services/collection.js';
import * as reports from './services/reports.js';
import * as jobOrders from './services/jobOrders.js';
import { resolveException } from './services/exceptions.js';
import { listNotifications } from './services/notify.js';
import { getIntegrations, getCredentialRow } from './google/index.js';
import { buildAuthUrl, handleCallback, disconnect } from './google/oauth.js';
import { toCSV, toXLSX, toPDF } from './lib/export.js';
import { FIELDS, WRITABLE_CANDIDATES } from './domain/fields.js';
import { nextMondayRun, MONDAY_CRON, TIMEZONE } from './scheduler.js';
import { tx } from './db.js';

const COOKIE = 'pa_session';
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, _res, next) {
  if (!req.user) return next(new AppError(401, 'Not signed in'));
  next();
}
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'Not signed in'));
  if (!roles.some((r) => req.user.roles.includes(r))) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};
const actor = (req) => ({ ...userActor(req.user), roles: req.user.roles, id: req.user.id, email: req.user.email });
const int = (v) => { const n = Number(v); if (!Number.isInteger(n)) throw badRequest('Invalid id'); return n; };

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  // CSRF: state-changing API calls must carry a custom header (not settable cross-site without CORS) + SameSite=Lax cookie (Lax so the Google OAuth redirect back keeps the session).
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/cron/')) return next();
    if (req.get('x-requested-with') !== 'pa-billing') return next(forbidden('Missing request header'));
    next();
  });
  app.use('/api', ah(async (req, _res, next) => {
    req.user = await auth.userForToken(req.cookies[COOKIE]);
    next();
  }));

  const api = express.Router();
  app.use('/api', api);

  // ───────── Auth ─────────
  api.post('/auth/login', ah(async (req, res) => {
    const r = await auth.login(req.body.email, req.body.password);
    if (!r) throw new AppError(401, 'Invalid email or password');
    res.cookie(COOKIE, r.token, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: config.sessionTtlHours * 3600000, path: '/' });
    res.json({ user: r.user });
  }));
  api.post('/auth/logout', ah(async (req, res) => { await auth.logout(req.cookies[COOKIE]); res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); }));
  api.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  // External scheduler hook (e.g. Cloud Scheduler) — shared secret, constant-time compare.
  api.post('/cron/monday', ah(async (req, res) => {
    const given = Buffer.from(String(req.get('x-cron-secret') || ''));
    const want = Buffer.from(config.cronSecret || '');
    if (!config.cronSecret || given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw forbidden('Invalid cron secret');
    res.json(await collection.runCollection({ trigger: 'external_cron' }));
  }));

  api.use(requireAuth);

  api.get('/notifications', ah(async (req, res) => res.json(await listNotifications(req.user))));
  api.get('/dashboard', ah(async (req, res) => res.json(await reports.dashboard(req.query.asOf && isValidDateStr(req.query.asOf) ? req.query.asOf : manilaDate()))));

  // ───────── Sync ─────────
  api.get('/sync/status', ah(async (_req, res) => res.json(await sync.syncStatus())));
  api.get('/sync/runs', ah(async (_req, res) => res.json((await query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 100')).rows)));
  api.post('/sync', requireRole('accounting', 'sysadmin'), ah(async (req, res) => res.json(await sync.runSync({ trigger: 'manual', actor: actor(req) }))));

  // ───────── Job orders ─────────
  api.get('/job-orders', ah(async (req, res) => {
    const asOf = manilaDate();
    let list = (await reports.jobOrderOverview(asOf)).map((j) => ({
      id: j.id, jo_number: j.jo_number, client: j.client_name || j.client_name_source, client_linked: !!j.client_id, project_name: j.project_name,
      delivery_status: j.delivery_status, delivery_date: j.delivery_date, invoice_number: j.invoice_number_source, billing_amount: toCents(j.billing_amount_source),
      payment_status: j.payment_status_source, paid_in_source: j.is_paid_in_source, source_present: j.source_present,
      stage: j.tracking.stage, exception: j.tracking.exception, flags: j.tracking.flags,
      outstanding: j.balance.hasLedger ? j.balance.outstanding : null, overdue: j.balance.overdue, days_overdue: j.balance.maxDaysOverdue,
      next_followup_date: j.next_followup_date,
    }));
    const q = String(req.query.q || '').toLowerCase();
    if (q) list = list.filter((j) => [j.jo_number, j.client, j.project_name, j.invoice_number].some((v) => String(v || '').toLowerCase().includes(q)));
    if (req.query.stage) list = list.filter((j) => j.stage === req.query.stage);
    if (req.query.overdue === '1') list = list.filter((j) => j.flags.overdue);
    if (req.query.unpaid === '1') list = list.filter((j) => !j.paid_in_source);
    res.json({ asOf, sync: await sync.syncStatus(), items: list });
  }));
  api.get('/job-orders/:id', ah(async (req, res) => res.json({ ...(await jobOrders.jobOrderDetail(int(req.params.id))), sync: await sync.syncStatus() })));
  api.patch('/job-orders/:id', requireRole('accounting'), ah(async (req, res) => {
    const { reason, ...patch } = req.body;
    res.json(await jobOrders.updateJobOrder(int(req.params.id), patch, actor(req), reason));
  }));
  api.post('/job-orders/:id/promises', requireRole('accounting'), ah(async (req, res) => res.json(await jobOrders.addPromise(int(req.params.id), req.body, actor(req)))));
  api.post('/job-orders/:id/activities', requireRole('accounting'), ah(async (req, res) => res.json(await jobOrders.addActivity(int(req.params.id), req.body, actor(req)))));
  api.post('/job-orders/:id/disputes', requireRole('accounting'), ah(async (req, res) => {
    const { rows: [d] } = await query('INSERT INTO disputes(job_order_id, invoice_id, description, opened_by) VALUES ($1,$2,$3,$4) RETURNING *', [int(req.params.id), req.body.invoiceId || null, req.body.description, req.user.id]);
    await audit(null, actor(req), 'dispute.opened', 'dispute', d.id, { after: d });
    res.json(d);
  }));
  api.post('/disputes/:id/resolve', requireRole('approver', 'management'), ah(async (req, res) => {
    if (!req.body.resolution?.trim()) throw badRequest('Resolution required');
    const { rows: [d] } = await query(`UPDATE disputes SET status='resolved', resolved_by=$2, resolved_at=now(), resolution=$3 WHERE id=$1 AND status='open' RETURNING *`, [int(req.params.id), req.user.id, req.body.resolution]);
    if (!d) throw notFound();
    await audit(null, actor(req), 'dispute.resolved', 'dispute', d.id, { reason: req.body.resolution });
    res.json(d);
  }));

  // ───────── Write-back (reconciliation screen) ─────────
  api.get('/writebacks', ah(async (req, res) => {
    const { rows } = await query(`SELECT w.*, j.jo_number, u.email AS requested_by_email, d.email AS decided_by_email FROM sheet_writebacks w JOIN job_orders j ON j.id=w.job_order_id
      JOIN users u ON u.id=w.requested_by LEFT JOIN users d ON d.id=w.decided_by ORDER BY (w.status='proposed') DESC, w.id DESC LIMIT 200`);
    res.json(rows);
  }));
  api.post('/writebacks', requireRole('accounting'), ah(async (req, res) => res.json(await sync.proposeWriteback(req.body, actor(req)))));
  api.post('/writebacks/:id/apply', requireRole('approver', 'management'), ah(async (req, res) => res.json(await sync.applyWriteback(int(req.params.id), actor(req)))));
  api.post('/writebacks/:id/reject', requireRole('approver', 'management'), ah(async (req, res) => res.json(await sync.rejectWriteback(int(req.params.id), actor(req), req.body.reason))));

  // ───────── Clients ─────────
  api.get('/clients', ah(async (_req, res) => {
    const ledgers = await ledger.allLedgers(manilaDate());
    const { rows } = await query(`SELECT c.*, (SELECT array_agg(alias_display) FROM client_aliases a WHERE a.client_id=c.id) AS aliases FROM clients c ORDER BY registered_name`);
    res.json(rows.map((c) => ({ ...c, totals: ledgers.get(c.id)?.totals || null })));
  }));
  api.get('/clients/:id', ah(async (req, res) => {
    const id = int(req.params.id);
    const { rows: [c] } = await query('SELECT * FROM clients WHERE id=$1', [id]);
    if (!c) throw notFound();
    const asOf = isValidDateStr(req.query.asOf) ? req.query.asOf : manilaDate();
    const l = await ledger.clientLedger(id, asOf, req.query.basis === 'restated' ? 'restated' : 'as_known');
    const { rows: aliases } = await query('SELECT * FROM client_aliases WHERE client_id=$1', [id]);
    const { rows: payments } = await query('SELECT * FROM payments WHERE client_id=$1 ORDER BY payment_date DESC', [id]);
    const { rows: invoices } = await query('SELECT * FROM invoices WHERE client_id=$1 ORDER BY invoice_date DESC NULLS LAST', [id]);
    res.json({ client: c, ledger: l, aliases, payments, invoices });
  }));
  const CLIENT_COLS = ['client_code', 'registered_name', 'trade_name', 'billing_contact', 'ap_contact_name', 'approved_billing_email', 'additional_recipients',
    'billing_address', 'payment_terms_days', 'credit_limit', 'preferred_payment_method', 'payment_instructions', 'collection_notes', 'account_status'];
  api.post('/clients', requireRole('accounting'), ah(async (req, res) => {
    const b = req.body;
    if (!b.client_code || !b.registered_name) throw badRequest('Client code and registered name are required');
    const vals = CLIENT_COLS.map((k) => b[k] ?? (k === 'additional_recipients' ? [] : k === 'account_status' ? 'active' : null));
    try {
      const { rows: [c] } = await query(`INSERT INTO clients(${CLIENT_COLS.join(',')}) VALUES (${CLIENT_COLS.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
      await audit(null, actor(req), 'client.created', 'client', c.id, { after: c });
      res.json(c);
    } catch (e) { if (e.code === '23505') throw badRequest('Client code already exists'); throw e; }
  }));
  api.put('/clients/:id', requireRole('accounting'), ah(async (req, res) => {
    const id = int(req.params.id);
    const { rows: [before] } = await query('SELECT * FROM clients WHERE id=$1', [id]);
    if (!before) throw notFound();
    const keys = CLIENT_COLS.filter((k) => k in req.body && k !== 'client_code');
    if (!keys.length) return res.json(before);
    const { rows: [c] } = await query(`UPDATE clients SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => req.body[k])]);
    await audit(null, actor(req), 'client.updated', 'client', id, { before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: Object.fromEntries(keys.map((k) => [k, c[k]])), reason: req.body.reason });
    res.json(c);
  }));
  api.post('/clients/:id/aliases', requireRole('accounting'), ah(async (req, res) => res.json(await jobOrders.addClientAlias(int(req.params.id), req.body.alias, actor(req)))));

  // ───────── Ledger ─────────
  api.get('/invoices', ah(async (req, res) => {
    const { rows } = await query(`SELECT i.*, c.registered_name, (SELECT array_agg(j.jo_number) FROM invoice_job_orders ij JOIN job_orders j ON j.id=ij.job_order_id WHERE ij.invoice_id=i.id) AS job_orders
      FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE ($1::text IS NULL OR i.status=$1) ORDER BY i.invoice_date DESC NULLS LAST LIMIT 500`, [req.query.status || null]);
    res.json(rows);
  }));
  api.post('/invoices', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.createInvoice(req.body, actor(req)))));
  api.post('/invoices/:id/reconcile', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.reconcileInvoice(int(req.params.id), req.body, actor(req)))));
  api.post('/invoices/:id/confirm-sent', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.confirmInvoiceSent(int(req.params.id), actor(req)))));
  api.post('/invoices/:id/void', requireRole('management'), ah(async (req, res) => res.json(await ledger.voidInvoice(int(req.params.id), req.body.reason, actor(req)))));

  api.get('/payments', ah(async (req, res) => {
    const { rows } = await query(`SELECT p.*, c.registered_name, (SELECT COALESCE(sum(amount),0) FROM payment_allocations a WHERE a.payment_id=p.id AND a.status='active') AS allocated,
      (SELECT json_agg(a.* ORDER BY a.id) FROM payment_allocations a WHERE a.payment_id=p.id) AS allocations
      FROM payments p JOIN clients c ON c.id=p.client_id WHERE ($1::text IS NULL OR p.status=$1) ORDER BY p.payment_date DESC LIMIT 500`, [req.query.status || null]);
    res.json(rows);
  }));
  api.post('/payments', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.recordPayment(req.body, actor(req)))));
  api.post('/payments/:id/verify', requireRole('accounting', 'approver'), ah(async (req, res) => res.json(await ledger.verifyPayment(int(req.params.id), actor(req), req.body.note))));
  api.post('/payments/:id/reject', requireRole('accounting', 'approver'), ah(async (req, res) => res.json(await ledger.rejectPayment(int(req.params.id), actor(req), req.body.reason))));
  api.post('/payments/:id/reverse', requireRole('approver', 'management'), ah(async (req, res) => res.json(await ledger.reversePayment(int(req.params.id), actor(req), req.body.reason))));
  api.post('/payments/:id/receipts', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.issueReceipt({ ...req.body, paymentId: int(req.params.id) }, actor(req)))));
  api.post('/allocations', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.allocatePayment(req.body, actor(req)))));
  api.post('/allocations/:id/reverse', requireRole('accounting', 'approver'), ah(async (req, res) => res.json(await ledger.reverseAllocation(int(req.params.id), actor(req), req.body.reason))));
  api.get('/adjustments', ah(async (_req, res) => res.json((await query(`SELECT a.*, i.invoice_number FROM adjustments a JOIN invoices i ON i.id=a.invoice_id ORDER BY a.id DESC LIMIT 300`)).rows)));
  api.post('/adjustments', requireRole('accounting'), ah(async (req, res) => res.json(await ledger.requestAdjustment(req.body, actor(req)))));
  api.post('/adjustments/:id/approve', requireRole('management'), ah(async (req, res) => res.json(await ledger.decideAdjustment(int(req.params.id), true, actor(req), req.body.note))));
  api.post('/adjustments/:id/reject', requireRole('management'), ah(async (req, res) => res.json(await ledger.decideAdjustment(int(req.params.id), false, actor(req), req.body.note))));
  api.post('/adjustments/:id/reverse', requireRole('management'), ah(async (req, res) => res.json(await ledger.reverseAdjustment(int(req.params.id), actor(req), req.body.reason))));

  // ───────── Statements of Account ─────────
  api.get('/soa', ah(async (req, res) => {
    const { rows } = await query(`SELECT s.id, s.statement_number, s.version, s.client_id, s.statement_date, s.mode, s.basis, s.status, s.has_discrepancy, s.totals,
      s.generated_at, s.reviewed_at, s.drive_web_link, s.drive_error, c.registered_name, g.email AS generated_by_email, r.email AS reviewed_by_email
      FROM soa_statements s JOIN clients c ON c.id=s.client_id LEFT JOIN users g ON g.id=s.generated_by LEFT JOIN users r ON r.id=s.reviewed_by
      WHERE ($1::int IS NULL OR s.client_id=$1) AND ($2::text IS NULL OR s.status=$2) ORDER BY s.generated_at DESC LIMIT 300`,
    [req.query.clientId ? int(req.query.clientId) : null, req.query.status || null]);
    res.json(rows);
  }));
  api.post('/soa', requireRole('accounting'), ah(async (req, res) => res.json(await soa.generateSoa({ ...req.body, clientId: int(req.body.clientId), actor: actor(req) }))));
  api.get('/soa/:id', ah(async (req, res) => {
    const { rows: [s] } = await query(`SELECT s.*, NULL AS pdf, c.registered_name FROM soa_statements s JOIN clients c ON c.id=s.client_id WHERE s.id=$1`, [int(req.params.id)]);
    if (!s) throw notFound();
    res.json(s);
  }));
  api.get('/soa/:id/pdf', ah(async (req, res) => {
    const s = await soa.getSoaPdf(int(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${s.statement_number}-v${s.version}.pdf"`);
    res.send(s.pdf);
  }));
  api.post('/soa/:id/review', requireRole('approver', 'accounting'), ah(async (req, res) => res.json(await soa.reviewSoa(int(req.params.id), req.body, actor(req)))));

  // ───────── Email drafts & approvals ─────────
  api.get('/drafts', ah(async (req, res) => {
    const statuses = req.query.status ? String(req.query.status).split(',') : null;
    const { rows } = await query(`SELECT d.id, d.status, d.version, d.subject, d.to_recipients, d.amounts, d.tone, d.blocked_reasons, d.created_at, d.updated_at, d.sent_at,
      d.collection_run_id, d.soa_id, j.jo_number, c.registered_name, s.status AS soa_status, r.run_key
      FROM email_drafts d JOIN job_orders j ON j.id=d.job_order_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN soa_statements s ON s.id=d.soa_id
      LEFT JOIN collection_runs r ON r.id=d.collection_run_id WHERE ($1::text[] IS NULL OR d.status = ANY($1)) ORDER BY d.id DESC LIMIT 500`, [statuses]);
    res.json(rows);
  }));
  api.get('/drafts/:id', ah(async (req, res) => {
    const id = int(req.params.id);
    const { rows: [d] } = await query(`SELECT d.*, j.jo_number, c.registered_name FROM email_drafts d JOIN job_orders j ON j.id=d.job_order_id LEFT JOIN clients c ON c.id=d.client_id WHERE d.id=$1`, [id]);
    if (!d) throw notFound();
    const [versions, approvals, attempts, soaRow, history] = await Promise.all([
      query('SELECT v.*, u.email AS edited_by_email FROM email_draft_versions v LEFT JOIN users u ON u.id=v.edited_by WHERE draft_id=$1 ORDER BY version DESC', [id]),
      query('SELECT a.*, u.email AS approver FROM approvals a JOIN users u ON u.id=a.approver_id WHERE draft_id=$1 ORDER BY id DESC', [id]),
      query('SELECT s.*, u.email AS attempted_by_email FROM send_attempts s JOIN users u ON u.id=s.attempted_by WHERE draft_id=$1 ORDER BY id DESC', [id]),
      d.soa_id ? query('SELECT id, statement_number, version, statement_date, status, has_discrepancy, totals, recon_report, drive_web_link FROM soa_statements WHERE id=$1', [d.soa_id]) : { rows: [] },
      query(`SELECT id, status, sent_at, subject, version FROM email_drafts WHERE job_order_id=$1 AND id<>$2 ORDER BY id DESC LIMIT 20`, [d.job_order_id, id]),
    ]);
    const currentHash = await email.hashForDraft(null, d);
    res.json({ draft: d, integrity: { storedHash: d.content_hash, currentHash, ok: currentHash === d.content_hash }, versions: versions.rows, approvals: approvals.rows,
      attempts: attempts.rows, soa: soaRow.rows[0] || null, accountHistory: history.rows });
  }));
  api.post('/drafts', requireRole('accounting'), ah(async (req, res) => {
    const joId = int(req.body.jobOrderId);
    const { rows: [jo] } = await query('SELECT * FROM job_orders WHERE id=$1', [joId]);
    if (!jo) throw notFound();
    if (jo.is_paid_in_source) throw badRequest('Job order is marked Paid in the Job Order List');
    const status = await sync.syncStatus();
    if (status.stale) throw new AppError(409, `Payment status is not current (${status.staleReason}). Sync first.`);
    let s = null;
    if (req.body.soaId) ({ rows: [s] } = await query('SELECT id, statement_number, version, statement_date, status, pdf_sha256, client_id FROM soa_statements WHERE id=$1', [int(req.body.soaId)]));
    if (s && s.client_id !== jo.client_id) throw badRequest('Statement belongs to another client');
    const d = await tx((db) => email.composeDraft(db, { jo, coveredJobOrders: [jo], soa: s, runId: null, actor: actor(req) }));
    res.json(d);
  }));
  api.put('/drafts/:id', requireRole('accounting'), ah(async (req, res) => res.json(await email.editDraft(int(req.params.id), req.body, actor(req)))));
  api.post('/drafts/:id/regenerate', requireRole('accounting'), ah(async (req, res) => res.json(await email.regenerateDraft(int(req.params.id), actor(req)))));
  api.post('/drafts/:id/decide', requireRole('approver'), ah(async (req, res) => res.json(await email.decideDraft(int(req.params.id), req.body, actor(req)))));
  api.post('/drafts/:id/send', requireRole('sender'), ah(async (req, res) => res.json(await email.sendDraft(int(req.params.id), actor(req)))));
  api.post('/drafts/:id/reconcile-send', requireRole('sender', 'approver'), ah(async (req, res) => res.json(await email.reconcileUnknownSend(int(req.params.id), actor(req)))));
  api.post('/drafts/:id/manual-resolve', requireRole('approver'), ah(async (req, res) => res.json(await email.manualResolveSend(int(req.params.id), req.body, actor(req)))));

  // ───────── Collection runs ─────────
  api.get('/collection-runs', ah(async (_req, res) => res.json({ runs: await collection.listRuns(), nextRun: nextMondayRun()?.toISOString(), cron: MONDAY_CRON, timezone: TIMEZONE })));
  api.get('/collection-runs/:key', ah(async (req, res) => res.json(await reports.mondayReport(req.params.key))));
  api.post('/collection-runs', requireRole('accounting', 'sysadmin'), ah(async (req, res) => res.json(await collection.runCollection({ trigger: 'manual', actor: actor(req) }))));

  // ───────── Exceptions ─────────
  api.get('/exceptions', ah(async (req, res) => {
    const { rows } = await query(`SELECT e.*, j.jo_number, c.registered_name, i.invoice_number FROM exceptions e LEFT JOIN job_orders j ON j.id=e.job_order_id
      LEFT JOIN clients c ON c.id=e.client_id LEFT JOIN invoices i ON i.id=e.invoice_id WHERE ($1::text IS NULL OR e.status=$1)
      ORDER BY e.status, CASE e.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, e.created_at DESC LIMIT 500`, [req.query.status || 'open']);
    res.json(rows);
  }));
  api.post('/exceptions/:id/resolve', requireRole('accounting', 'approver', 'management'), ah(async (req, res) => res.json(await resolveException(int(req.params.id), actor(req), req.body.resolution))));

  // ───────── Reports ─────────
  api.get('/reports/:kind', ah(async (req, res) => {
    const k = req.params.kind;
    const d = isValidDateStr(req.query.date) ? req.query.date : undefined;
    const r = k === 'daily' ? await reports.dailyReport(d) : k === 'unbilled' ? await reports.unbilledReport(d)
      : k === 'monday' ? await reports.mondayReport(req.query.run || undefined) : k === 'weekly' ? await reports.weeklyReport(d)
        : k === 'monthly' ? await reports.monthlyReport(req.query.month || undefined) : null;
    if (!r) throw notFound('Unknown report');
    const fmt = req.query.format || 'json';
    const name = `${k}-${r.asOf}`;
    if (fmt === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); return res.send(toCSV(r)); }
    if (fmt === 'xlsx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`); return res.send(await toXLSX(r)); }
    if (fmt === 'pdf') { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`); return res.send(await toPDF(r)); }
    res.json(r);
  }));

  // ───────── Audit ─────────
  api.get('/audit', requireRole('management', 'approver', 'sysadmin', 'accounting'), ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM audit_log WHERE ($1::text IS NULL OR entity_type=$1) AND ($2::text IS NULL OR entity_id=$2)
      AND ($3::text IS NULL OR action ILIKE $3 || '%') AND ($4::text IS NULL OR actor_label ILIKE '%' || $4 || '%' OR entity_id ILIKE '%' || $4 || '%' OR reason ILIKE '%' || $4 || '%')
      AND ($5::date IS NULL OR at >= $5::date) AND ($6::date IS NULL OR at < $6::date + 1) ORDER BY id DESC LIMIT 500`,
    [req.query.entityType || null, req.query.entityId || null, req.query.action || null, req.query.q || null, req.query.from || null, req.query.to || null]);
    res.json(rows);
  }));

  // ───────── Settings & integrations ─────────
  api.get('/settings', ah(async (_req, res) => res.json({ settings: await settings.getAllSettings(), fields: FIELDS, writableCandidates: WRITABLE_CANDIDATES })));
  api.put('/settings/:key', requireRole('sysadmin'), ah(async (req, res) => {
    await settings.setSetting(req.params.key, req.body.value, actor(req), req.body.reason);
    res.json({ ok: true });
  }));
  api.get('/integrations', ah(async (_req, res) => {
    const cred = await getCredentialRow();
    const integ = await getIntegrations();
    const sheetCfg = await settings.getSetting('sheet');
    const folder = await settings.getSetting('soaFolderId');
    const { rows: errors } = await query('SELECT * FROM integration_errors ORDER BY id DESC LIMIT 20');
    const { rows: [lastRun] } = await query('SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT 1');
    res.json({
      oauthConfigured: !!(config.google.clientId && config.google.clientSecret), encryptionConfigured: !!config.encryptionKey,
      connected: !!cred, account: cred?.account_email || null, scopes: cred?.scopes || [], connectedAt: cred?.connected_at || null,
      sheets: { authorized: !!integ.sheets, spreadsheetId: sheetCfg.spreadsheetId, tabName: sheetCfg.tabName, mappedFields: Object.keys(sheetCfg.mapping || {}).length },
      drive: { authorized: !!integ.drive, soaFolderId: folder || null },
      gmail: { authorized: !!integ.gmail, sendingAccount: integ.gmail?.account || null },
      sync: await sync.syncStatus(), lastCollectionRun: lastRun || null, nextCollectionRun: nextMondayRun()?.toISOString(), errors,
    });
  }));
  api.post('/integrations/test', requireRole('sysadmin'), ah(async (_req, res) => {
    const integ = await getIntegrations();
    const out = {};
    const sheetCfg = await settings.getSetting('sheet');
    const t = async (name, fn) => { try { out[name] = { ok: true, detail: await fn() }; } catch (e) { out[name] = { ok: false, error: e.message }; } };
    await t('sheets', async () => { if (!integ.sheets) throw new Error('Not authorized'); if (!sheetCfg.spreadsheetId) throw new Error('Spreadsheet not configured'); const m = await integ.sheets.getMetadata(sheetCfg.spreadsheetId); return { title: m.title, tabs: m.tabs.map((x) => x.title) }; });
    await t('drive', async () => { if (!integ.drive) throw new Error('Not authorized'); const f = await settings.getSetting('soaFolderId'); if (!f) throw new Error('SOA folder not configured'); return await integ.drive.getFile(f); });
    await t('gmail', async () => { if (!integ.gmail) throw new Error('Not authorized'); const p = await integ.gmail.profile(); return { emailAddress: p.emailAddress }; });
    await audit(null, actor(_req), 'integrations.tested', 'integration', 'google', { after: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.ok])) });
    res.json(out);
  }));
  api.post('/integrations/discover', requireRole('sysadmin', 'accounting'), ah(async (req, res) => res.json(await sync.discoverSpreadsheet(req.body.spreadsheetId, req.body.tabName))));
  api.post('/integrations/soa-folder', requireRole('sysadmin'), ah(async (req, res) => {
    const { drive } = await getIntegrations();
    if (!drive) throw new AppError(503, 'Google Drive is not connected');
    const f = await drive.createFolder(req.body.name || 'Print Amplified – Statements of Account');
    await settings.setSetting('soaFolderId', f.id, actor(req), 'Created SOA storage folder');
    res.json(f);
  }));
  api.get('/google/oauth/start', requireRole('sysadmin'), ah(async (req, res) => {
    const state = randomToken(16);
    res.cookie('pa_oauth_state', state, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 600000, path: '/api/google' });
    res.redirect(buildAuthUrl(state));
  }));
  api.get('/google/oauth/callback', requireRole('sysadmin'), ah(async (req, res) => {
    if (!req.query.state || req.query.state !== req.cookies.pa_oauth_state) throw forbidden('OAuth state mismatch');
    res.clearCookie('pa_oauth_state', { path: '/api/google' });
    if (req.query.error) return res.redirect(`/#/settings?oauth_error=${encodeURIComponent(req.query.error)}`);
    await handleCallback(String(req.query.code), actor(req));
    res.redirect('/#/settings?connected=1');
  }));
  api.post('/google/disconnect', requireRole('sysadmin'), ah(async (req, res) => { await disconnect(actor(req)); res.json({ ok: true }); }));

  // ───────── Users ─────────
  api.get('/users', requireRole('sysadmin', 'management'), ah(async (_req, res) => res.json((await query('SELECT id, email, name, roles, active, created_at FROM users ORDER BY email')).rows)));
  api.get('/users/directory', ah(async (_req, res) => res.json((await query('SELECT id, email, name FROM users WHERE active ORDER BY name')).rows)));
  api.post('/users', requireRole('sysadmin'), ah(async (req, res) => res.json(await auth.createUser(req.body, actor(req)))));
  api.patch('/users/:id', requireRole('sysadmin'), ah(async (req, res) => res.json(await auth.updateUser(int(req.params.id), req.body, actor(req)))));

  api.use((_req, _res, next) => next(notFound('Unknown API route')));

  // ───────── Static frontend ─────────
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: 'index.html' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    const status = err.status || (err.code === '23505' ? 409 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !(err instanceof AppError) ? 'Internal error' : err.message, details: err.details });
  });
  return app;
}

export { fromCents, toCents };
