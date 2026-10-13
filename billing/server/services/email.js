import { query, tx } from '../db.js';
import { buildCollectionEmail, draftContentHash, sendBlockers } from '../domain/emailDraft.js';
import { jobOrderBalance } from './ledger.js';
import { getSetting } from './settings.js';
import { audit, SYSTEM } from './audit.js';
import { runSync } from './sync.js';
import { getIntegrations, IntegrationError } from '../google/index.js';
import { buildMime, toBase64Url } from '../lib/mime.js';
import { randomToken } from '../lib/crypto.js';
import { manilaDate, addDays } from '../lib/dates.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { notifyRole } from './notify.js';

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

async function soaRow(db, id) {
  if (!id) return null;
  const { rows } = await (db || { query }).query('SELECT id, statement_number, version, statement_date, status, pdf_sha256, client_id FROM soa_statements WHERE id=$1', [id]);
  return rows[0] || null;
}

export async function hashForDraft(db, d) {
  const soa = await soaRow(db, d.soa_id);
  return draftContentHash({ to: d.to_recipients, cc: d.cc_recipients, subject: d.subject, body: d.body_text, soaId: d.soa_id, soaPdfSha256: soa?.pdf_sha256, amounts: d.amounts });
}

/** Compose and store a collection draft for one job order (plus any JOs sharing its invoices). */
export async function composeDraft(db, { jo, coveredJobOrders, soa, runId, actor = SYSTEM, extraBlocked = [] }) {
  const asOf = manilaDate();
  const { rows: [client] } = jo.client_id ? await db.query('SELECT * FROM clients WHERE id=$1', [jo.client_id]) : { rows: [] };
  const company = await getSetting('company');
  const instructions = client?.payment_instructions || (await getSetting('paymentInstructions'));
  const balance = await jobOrderBalance(jo.id, asOf, db);
  const ids = coveredJobOrders.map((j) => j.id);
  const { rows: [{ n: priorSent }] } = await db.query(`SELECT count(*)::int n FROM email_drafts WHERE job_order_id = ANY($1) AND status='sent'`, [ids]);
  const { rows: [promise] } = await db.query(
    `SELECT * FROM payment_promises WHERE job_order_id = ANY($1) AND promised_date >= $2 ORDER BY recorded_at DESC LIMIT 1`, [ids, addDays(asOf, -14)]);
  const e = buildCollectionEmail({ company, client, jobOrders: coveredJobOrders, balance, soa, instructions, promise, priorSent, asOf });
  const blocked = [...e.blockedReasons, ...extraBlocked];
  const hash = draftContentHash({ to: e.to, cc: e.cc, subject: e.subject, body: e.body, soaId: soa?.id, soaPdfSha256: soa?.pdf_sha256, amounts: e.amounts });
  const { rows: [d] } = await db.query(
    `INSERT INTO email_drafts(job_order_id, covered_job_order_ids, client_id, collection_run_id, soa_id, to_recipients, cc_recipients, subject, body_text, amounts, tone, content_hash, status, blocked_reasons, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [jo.id, ids, client?.id ?? null, runId ?? null, soa?.id ?? null, e.to, e.cc, e.subject, e.body, JSON.stringify(e.amounts), e.tone, hash,
      blocked.length ? 'blocked' : 'pending_approval', blocked, actor.id ?? null]);
  await db.query(`INSERT INTO email_draft_versions(draft_id, version, to_recipients, cc_recipients, subject, body_text, soa_id, amounts, content_hash, edited_by)
                   VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9)`, [d.id, e.to, e.cc, e.subject, e.body, soa?.id ?? null, JSON.stringify(e.amounts), hash, actor.id ?? null]);
  await audit(db, actor, 'email_draft.created', 'email_draft', d.id, { after: { status: d.status, blocked, outstanding: e.amounts.outstanding, to: e.to }, related: { jo: jo.jo_number, runId, soaId: soa?.id } });
  return d;
}

async function invalidateApprovals(db, draftId, reason, actor) {
  const { rows } = await db.query(`UPDATE approvals SET invalidated_at=now(), invalidated_reason=$2 WHERE draft_id=$1 AND decision='approve' AND invalidated_at IS NULL RETURNING id`, [draftId, reason]);
  for (const r of rows) await audit(db, actor, 'approval.invalidated', 'approval', r.id, { reason, related: { draftId } });
  return rows.length;
}

/** Cancel a draft that should no longer be sent (superseded, source marked Paid, …). */
export async function cancelDraft(db, draftId, reason, actor = SYSTEM) {
  await invalidateApprovals(db, draftId, reason, actor);
  const { rows } = await db.query(`UPDATE email_drafts SET status='cancelled', blocked_reasons=array_append(blocked_reasons,$2), updated_at=now()
    WHERE id=$1 AND status IN ('blocked','pending_approval','approved','returned','on_hold','send_failed') RETURNING id`, [draftId, reason]);
  if (rows.length) await audit(db, actor, 'email_draft.cancelled', 'email_draft', draftId, { reason });
}

/** Staff edit → new version. Any approval on the draft is invalidated (material change). */
export async function editDraft(id, { to, cc, subject, body, soaId }, actor) {
  return tx(async (db) => {
    const { rows: [d] } = await db.query('SELECT * FROM email_drafts WHERE id=$1 FOR UPDATE', [id]);
    if (!d) throw notFound();
    if (['sending', 'sent', 'send_unknown', 'cancelled', 'rejected'].includes(d.status)) throw conflict(`A ${d.status} draft cannot be edited`);
    const next = {
      to_recipients: to ?? d.to_recipients, cc_recipients: cc ?? d.cc_recipients,
      subject: subject ?? d.subject, body_text: body ?? d.body_text, soa_id: soaId ?? d.soa_id, amounts: d.amounts,
    };
    for (const a of [...next.to_recipients, ...next.cc_recipients]) if (!EMAIL_RE.test(a)) throw badRequest(`Invalid email address: ${a}`);
    if (!next.to_recipients.length) throw badRequest('At least one recipient is required');
    if (!next.subject.trim() || !next.body_text.trim()) throw badRequest('Subject and body are required');
    if (soaId) {
      const soa = await soaRow(db, soaId);
      if (!soa || soa.client_id !== d.client_id) throw badRequest('Statement belongs to a different client');
    }
    const hash = await hashForDraft(db, next);
    if (hash === d.content_hash) return d;
    const version = d.version + 1;
    // Recipients must come from the Client Master's approved addresses — never typed-in guesses.
    const { rows: [client] } = d.client_id ? await db.query('SELECT approved_billing_email, additional_recipients FROM clients WHERE id=$1', [d.client_id]) : { rows: [] };
    const approvedAddrs = new Set([client?.approved_billing_email, ...(client?.additional_recipients || [])].filter(Boolean).map((x) => x.toLowerCase()));
    const unapproved = [...next.to_recipients, ...next.cc_recipients].filter((a) => !approvedAddrs.has(a.toLowerCase()));
    if (unapproved.length) throw badRequest(`Not an approved recipient for this client (update the Client Master first): ${unapproved.join(', ')}`);
    const reasons = d.blocked_reasons;
    const status = reasons.length ? 'blocked' : 'pending_approval';
    const invalidated = await invalidateApprovals(db, id, 'Draft edited after approval', actor);
    await db.query(`UPDATE email_drafts SET to_recipients=$2, cc_recipients=$3, subject=$4, body_text=$5, soa_id=$6, content_hash=$7, version=$8, status=$9,
                    blocked_reasons=$10, last_edited_by=$11, updated_at=now() WHERE id=$1`,
      [id, next.to_recipients, next.cc_recipients, next.subject, next.body_text, next.soa_id, hash, version, status, reasons, actor.id]);
    await db.query(`INSERT INTO email_draft_versions(draft_id, version, to_recipients, cc_recipients, subject, body_text, soa_id, amounts, content_hash, edited_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, version, next.to_recipients, next.cc_recipients, next.subject, next.body_text, next.soa_id, JSON.stringify(next.amounts), hash, actor.id]);
    await audit(db, actor, 'email_draft.edited', 'email_draft', id, {
      before: { version: d.version, to: d.to_recipients, cc: d.cc_recipients, subject: d.subject, soaId: d.soa_id },
      after: { version, to: next.to_recipients, cc: next.cc_recipients, subject: next.subject, soaId: next.soa_id, approvalsInvalidated: invalidated } });
    return { ...d, ...next, version, status, content_hash: hash };
  });
}

/** Approver decision: approve | return | reject | hold. */
export async function decideDraft(id, { decision, note }, actor) {
  if (!['approve', 'return', 'reject', 'hold'].includes(decision)) throw badRequest('Invalid decision');
  if (!actor.roles.includes('approver')) throw forbidden('Only Authorized Approvers can decide on collection emails');
  if (decision !== 'approve' && !note?.trim()) throw badRequest('A note is required when returning, rejecting or holding a draft');
  const policy = await getSetting('policy');
  const result = await tx(async (db) => {
    const { rows: [d] } = await db.query('SELECT * FROM email_drafts WHERE id=$1 FOR UPDATE', [id]);
    if (!d) throw notFound();
    if (!['pending_approval', 'on_hold'].includes(d.status) && !(decision !== 'approve' && d.status === 'blocked')) throw conflict(`Draft is ${d.status}`);
    const authors = [d.created_by, d.last_edited_by].filter((x) => x != null);
    const self = authors.includes(actor.id);
    if (self && !policy.allowSelfApproval) throw forbidden('You cannot approve or decide on a draft you created or edited');
    const currentHash = await hashForDraft(db, d);
    if (currentHash !== d.content_hash) throw conflict('Draft content hash mismatch; reload the draft');
    if (decision === 'approve') {
      if (d.blocked_reasons.length) throw conflict(`Draft is blocked: ${d.blocked_reasons.join('; ')}`);
      const soa = await soaRow(db, d.soa_id);
      if (!soa || soa.status !== 'reviewed') throw conflict('The attached Statement of Account must be reviewed before the email can be approved');
    }
    const expires = decision === 'approve' && policy.approvalExpiryHours ? new Date(Date.now() + policy.approvalExpiryHours * 3600000) : null;
    const { rows: [ap] } = await db.query(
      `INSERT INTO approvals(draft_id, draft_version, content_hash, decision, approver_id, note, self_approval, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, d.version, currentHash, decision, actor.id, note || null, self, expires]);
    const status = { approve: 'approved', return: 'returned', reject: 'rejected', hold: 'on_hold' }[decision];
    await db.query('UPDATE email_drafts SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
    await audit(db, actor, `email_draft.${decision}`, 'email_draft', id, { before: { status: d.status }, after: { status, version: d.version, hash: currentHash, selfApproval: self }, reason: note, related: { approvalId: ap.id } });
    return { draft: { ...d, status }, approval: ap };
  });
  if (decision === 'approve') await syncGmailDraft(id).catch(() => {});
  if (decision === 'approve') await notifyRole('sender', 'draft_approved', `Collection email #${id} approved and ready to send`, `/approvals/${id}`);
  return result;
}

async function buildRaw(d, sendKey) {
  const { rows: [soa] } = await query('SELECT statement_number, version, pdf FROM soa_statements WHERE id=$1', [d.soa_id]);
  const { gmail } = await getIntegrations();
  const domain = (gmail?.account || 'printamplified.local').split('@')[1];
  const mime = buildMime({
    from: gmail?.account, to: d.to_recipients, cc: d.cc_recipients, subject: d.subject, text: d.body_text,
    attachments: soa ? [{ filename: `${soa.statement_number}${soa.version > 1 ? `-v${soa.version}` : ''}.pdf`, contentType: 'application/pdf', content: soa.pdf }] : [],
    messageId: sendKey ? `<${sendKey}@${domain}>` : undefined,
    headers: sendKey ? { 'X-PA-Send-Key': sendKey, 'X-PA-Draft': `${d.id}.v${d.version}` } : { 'X-PA-Draft': `${d.id}.v${d.version}` },
  });
  return toBase64Url(mime);
}

/** Mirror the approved version into Gmail Drafts so it is visible there. Failure leaves the app draft intact. */
export async function syncGmailDraft(id, sendKey) {
  const { gmail } = await getIntegrations();
  if (!gmail) throw new AppError(503, 'Gmail is not connected; the draft is retained in the application');
  const { rows: [d] } = await query('SELECT * FROM email_drafts WHERE id=$1', [id]);
  const raw = await buildRaw(d, sendKey);
  if (d.gmail_draft_id && (await gmail.draftExists(d.gmail_draft_id))) {
    await gmail.updateDraft(d.gmail_draft_id, raw);
    return d.gmail_draft_id;
  }
  const created = await gmail.createDraft(raw);
  await query('UPDATE email_drafts SET gmail_draft_id=$2 WHERE id=$1', [id, created.id]);
  return created.id;
}

/**
 * Send an approved draft. Order of checks:
 *  1. Exclusive in-flight lock (one attempt at a time, none while an outcome is unknown).
 *  2. Fresh synchronization of the Job Order List; abort if it fails (stale status is never trusted).
 *  3. Block if the job order is now marked Paid; require re-approval if amounts changed.
 *  4. Approval/hash/SOA/role gate.
 *  5. Gmail send, recording the provider message id — or the failure/uncertainty.
 */
export async function sendDraft(id, actor) {
  if (!actor.roles.includes('sender')) throw forbidden('Only Authorized Senders can send collection emails');
  const { rows: [pre] } = await query('SELECT * FROM email_drafts WHERE id=$1', [id]);
  if (!pre) throw notFound();
  if (pre.status === 'send_unknown') throw conflict('The previous send attempt has an unknown outcome. Reconcile it before retrying.');
  if (!['approved', 'send_failed'].includes(pre.status)) throw conflict(`Draft is ${pre.status}; only approved drafts can be sent`);

  const sync = await runSync({ trigger: 'pre_send', actor });
  if (sync.status !== 'succeeded') {
    await audit(null, actor, 'email_send.blocked', 'email_draft', id, { reason: `Payment status could not be revalidated: ${sync.error || sync.reason}` });
    throw new AppError(503, `Send blocked: the Job Order List could not be re-synchronized to confirm payment status (${sync.error || sync.reason}).`);
  }

  const gate = await tx(async (db) => {
    const { rows: [d] } = await db.query('SELECT * FROM email_drafts WHERE id=$1 FOR UPDATE', [id]);
    if (!['approved', 'send_failed'].includes(d.status)) throw conflict(`Draft is ${d.status}`);
    const { rows: jos } = await db.query('SELECT * FROM job_orders WHERE id = ANY($1)', [d.covered_job_order_ids]);
    const paidNow = jos.filter((j) => j.is_paid_in_source);
    if (paidNow.length) {
      await cancelDraft(db, id, `Job order ${paidNow.map((j) => j.jo_number).join(', ')} is now marked Paid in the Job Order List`, actor);
      await audit(db, actor, 'email_send.blocked', 'email_draft', id, { reason: 'Marked Paid at source before sending' });
      return { blocked: 'Job order is now marked Paid in the Job Order List; the routine collection email was cancelled.' };
    }
    if (jos.some((j) => !j.source_present || ['cancelled', 'disputed', 'on_hold'].includes(j.exception_state))) {
      await invalidateApprovals(db, id, 'Job order status changed (removed/cancelled/disputed/on hold)', actor);
      await db.query(`UPDATE email_drafts SET status='pending_approval', updated_at=now() WHERE id=$1`, [id]);
      return { blocked: 'Job order status changed since approval; renewed review is required.' };
    }
    const balance = await jobOrderBalance(d.job_order_id, manilaDate(), db);
    if (balance.outstanding !== d.amounts.outstanding) {
      await invalidateApprovals(db, id, `Outstanding balance changed from ${d.amounts.outstanding} to ${balance.outstanding} centavos`, actor);
      await db.query(`UPDATE email_drafts SET status='pending_approval', blocked_reasons=array_append(blocked_reasons,'Amounts changed since approval — regenerate the draft'), updated_at=now() WHERE id=$1`, [id]);
      return { blocked: 'The outstanding balance changed since approval. Regenerate the draft and obtain renewed approval.' };
    }
    const { rows: [approval] } = await db.query(`SELECT * FROM approvals WHERE draft_id=$1 ORDER BY id DESC LIMIT 1`, [id]);
    const soa = await soaRow(db, d.soa_id);
    const currentHash = await hashForDraft(db, d);
    const reasons = sendBlockers({ draft: d, approval, soa, currentHash, sender: actor });
    if (reasons.length) return { blocked: reasons.join('; ') };
    const sendKey = `pa-${d.id}-v${d.version}-${randomToken(9)}`;
    let attempt;
    try {
      ({ rows: [attempt] } = await db.query(`INSERT INTO send_attempts(draft_id, approval_id, send_key, attempted_by) VALUES ($1,$2,$3,$4) RETURNING *`, [id, approval.id, sendKey, actor.id]));
    } catch (e) {
      if (e.code === '23505') throw conflict('Another send attempt for this draft is already in progress');
      throw e;
    }
    await db.query(`UPDATE email_drafts SET status='sending', updated_at=now() WHERE id=$1`, [id]);
    await audit(db, actor, 'email_send.attempt', 'email_draft', id, { related: { attemptId: attempt.id, sendKey, approvalId: approval.id } });
    return { attempt, draft: d };
  });
  if (gate.blocked) throw conflict(gate.blocked);

  const { attempt } = gate;
  const finish = async (attemptStatus, draftStatus, extra = {}) => {
    await tx(async (db) => {
      await db.query(`UPDATE send_attempts SET status=$2, finished_at=now(), gmail_message_id=$3, gmail_thread_id=$4, error=$5 WHERE id=$1`,
        [attempt.id, attemptStatus, extra.messageId ?? null, extra.threadId ?? null, extra.error ?? null]);
      await db.query(`UPDATE email_drafts SET status=$2, gmail_message_id=COALESCE($3,gmail_message_id), gmail_thread_id=COALESCE($4,gmail_thread_id),
                      sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END, updated_at=now() WHERE id=$1`,
        [id, draftStatus, extra.messageId ?? null, extra.threadId ?? null]);
      await audit(db, actor, `email_send.${attemptStatus}`, 'email_draft', id, { after: { status: draftStatus, ...extra }, related: { attemptId: attempt.id } });
      if (draftStatus === 'sent') {
        const { rows: [d] } = await db.query('SELECT * FROM email_drafts WHERE id=$1', [id]);
        for (const jid of d.covered_job_order_ids) {
          await db.query(`INSERT INTO collection_activities(job_order_id, client_id, kind, note, actor_id) VALUES ($1,$2,'email_sent',$3,$4)`,
            [jid, d.client_id, `Collection email sent (draft #${id} v${d.version}, Gmail id ${extra.messageId})`, actor.id]);
        }
      }
    });
  };

  const { gmail } = await getIntegrations();
  if (!gmail) {
    await finish('failed', 'send_failed', { error: 'Gmail is not connected' });
    throw new AppError(503, 'Gmail is not connected. The approved draft is retained; reconnect Gmail and retry.');
  }
  let gmailDraftId;
  try {
    gmailDraftId = await syncGmailDraft(id, attempt.send_key);
  } catch (e) {
    // Preparing the Gmail draft cannot send anything, so this is a definite failure.
    await finish('failed', 'send_failed', { error: `Could not prepare Gmail draft: ${e.message}` });
    throw new AppError(502, `Gmail draft preparation failed: ${e.message}`);
  }
  try {
    const sent = await gmail.sendDraft(gmailDraftId);
    await finish('succeeded', 'sent', { messageId: sent.id, threadId: sent.threadId });
    return { status: 'sent', messageId: sent.id, threadId: sent.threadId };
  } catch (e) {
    if (e instanceof IntegrationError && !e.uncertain) {
      await finish('failed', 'send_failed', { error: e.message });
      throw new AppError(502, `Gmail rejected the send: ${e.message}. The draft is retained for a controlled retry.`);
    }
    await finish('unknown', 'send_unknown', { error: e.message });
    await notifyRole('approver', 'send_unknown', `Send outcome unknown for draft #${id}; reconciliation required before any retry`, `/approvals/${id}`);
    throw new AppError(502, `The send outcome is uncertain (${e.message}). It must be reconciled before any retry to avoid a duplicate email.`);
  }
}

/** Attempts left 'in_progress' (e.g. process crash mid-send) become 'unknown' — never silently retried. */
export async function markStaleAttempts(minutes = 10) {
  const { rows } = await query(`UPDATE send_attempts SET status='unknown', error=COALESCE(error,'')||'Process interrupted during send'
    WHERE status='in_progress' AND started_at < now() - make_interval(mins => $1) RETURNING draft_id`, [minutes]);
  for (const r of rows) {
    await query(`UPDATE email_drafts SET status='send_unknown' WHERE id=$1 AND status='sending'`, [r.draft_id]);
    await audit(null, SYSTEM, 'email_send.marked_unknown', 'email_draft', r.draft_id, { reason: 'Send attempt did not complete' });
  }
  return rows.length;
}

/** Resolve an uncertain send using provider evidence: our unique header in SENT, or the Gmail draft still existing. */
export async function reconcileUnknownSend(id, actor) {
  const { rows: [att] } = await query(`SELECT * FROM send_attempts WHERE draft_id=$1 AND status='unknown' ORDER BY id DESC LIMIT 1`, [id]);
  if (!att) throw conflict('No send attempt with an unknown outcome');
  const { gmail } = await getIntegrations();
  if (!gmail) throw new AppError(503, 'Gmail is not connected');
  const { rows: [d] } = await query('SELECT * FROM email_drafts WHERE id=$1', [id]);
  const found = await gmail.findSentBySendKey(att.send_key);
  if (found) {
    await tx(async (db) => {
      await db.query(`UPDATE send_attempts SET status='reconciled_sent', gmail_message_id=$2, gmail_thread_id=$3, finished_at=now() WHERE id=$1`, [att.id, found.id, found.threadId]);
      await db.query(`UPDATE email_drafts SET status='sent', gmail_message_id=$2, gmail_thread_id=$3, sent_at=now() WHERE id=$1`, [id, found.id, found.threadId]);
      await audit(db, actor, 'email_send.reconciled_sent', 'email_draft', id, { after: { messageId: found.id }, related: { attemptId: att.id } });
    });
    return { outcome: 'sent', messageId: found.id };
  }
  const stillDraft = d.gmail_draft_id ? await gmail.draftExists(d.gmail_draft_id) : false;
  if (stillDraft) {
    await tx(async (db) => {
      await db.query(`UPDATE send_attempts SET status='reconciled_not_sent', finished_at=now() WHERE id=$1`, [att.id]);
      await db.query(`UPDATE email_drafts SET status='send_failed' WHERE id=$1`, [id]);
      await audit(db, actor, 'email_send.reconciled_not_sent', 'email_draft', id, { related: { attemptId: att.id } });
    });
    return { outcome: 'not_sent' };
  }
  return { outcome: 'undetermined', message: 'No evidence either way. Check the Gmail Sent folder and record the result manually.' };
}

/** Manual confirmation by an approver when provider evidence is inconclusive. */
export async function manualResolveSend(id, { wasSent, note }, actor) {
  if (!actor.roles.includes('approver')) throw forbidden();
  if (!note?.trim()) throw badRequest('A note describing the evidence is required');
  return tx(async (db) => {
    const { rows: [att] } = await db.query(`SELECT * FROM send_attempts WHERE draft_id=$1 AND status='unknown' ORDER BY id DESC LIMIT 1 FOR UPDATE`, [id]);
    if (!att) throw conflict('No send attempt with an unknown outcome');
    await db.query(`UPDATE send_attempts SET status=$2, finished_at=now(), error=COALESCE(error,'')||' | manual: '||$3 WHERE id=$1`, [att.id, wasSent ? 'reconciled_sent' : 'reconciled_not_sent', note]);
    await db.query(`UPDATE email_drafts SET status=$2, sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END WHERE id=$1`, [id, wasSent ? 'sent' : 'send_failed']);
    await audit(db, actor, 'email_send.manual_resolution', 'email_draft', id, { after: { wasSent }, reason: note, related: { attemptId: att.id } });
  });
}

/** Rebuild a returned/blocked draft from current data (new version; prior approvals invalidated). */
export async function regenerateDraft(id, actor) {
  return tx(async (db) => {
    const { rows: [d] } = await db.query('SELECT * FROM email_drafts WHERE id=$1 FOR UPDATE', [id]);
    if (!d) throw notFound();
    if (['sending', 'sent', 'send_unknown', 'cancelled'].includes(d.status)) throw conflict(`A ${d.status} draft cannot be regenerated`);
    const { rows: [jo] } = await db.query('SELECT * FROM job_orders WHERE id=$1', [d.job_order_id]);
    const { rows: covered } = await db.query('SELECT * FROM job_orders WHERE id = ANY($1) ORDER BY jo_number', [d.covered_job_order_ids]);
    const { rows: [soa] } = await db.query(
      `SELECT id, statement_number, version, statement_date, status, pdf_sha256 FROM soa_statements WHERE client_id=$1 AND mode='outstanding' AND status IN ('reviewed','pending_review') ORDER BY generated_at DESC LIMIT 1`, [d.client_id]);
    const company = await getSetting('company');
    const { rows: [client] } = d.client_id ? await db.query('SELECT * FROM clients WHERE id=$1', [d.client_id]) : { rows: [] };
    const instructions = client?.payment_instructions || (await getSetting('paymentInstructions'));
    const balance = await jobOrderBalance(jo.id, manilaDate(), db);
    const e = buildCollectionEmail({ company, client, jobOrders: covered, balance, soa, instructions, promise: null, priorSent: 0, asOf: manilaDate() });
    const hash = draftContentHash({ to: e.to, cc: e.cc, subject: e.subject, body: e.body, soaId: soa?.id, soaPdfSha256: soa?.pdf_sha256, amounts: e.amounts });
    await invalidateApprovals(db, id, 'Draft regenerated', actor);
    const version = d.version + 1;
    await db.query(`UPDATE email_drafts SET to_recipients=$2, cc_recipients=$3, subject=$4, body_text=$5, soa_id=$6, amounts=$7, content_hash=$8, version=$9,
      status=$10, blocked_reasons=$11, tone=$12, last_edited_by=$13, updated_at=now() WHERE id=$1`,
    [id, e.to, e.cc, e.subject, e.body, soa?.id ?? null, JSON.stringify(e.amounts), hash, version, e.blockedReasons.length ? 'blocked' : 'pending_approval', e.blockedReasons, e.tone, actor.id]);
    await db.query(`INSERT INTO email_draft_versions(draft_id, version, to_recipients, cc_recipients, subject, body_text, soa_id, amounts, content_hash, edited_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, version, e.to, e.cc, e.subject, e.body, soa?.id ?? null, JSON.stringify(e.amounts), hash, actor.id]);
    await audit(db, actor, 'email_draft.regenerated', 'email_draft', id, { after: { version, outstanding: e.amounts.outstanding, blocked: e.blockedReasons } });
    return { id, version };
  });
}
