import { query } from '../db.js';
import { audit } from './audit.js';

/** Raise (or refresh) an open exception identified by dedupeKey. Returns the row. */
export async function raiseException(db, { kind, key, severity = 'warning', message, jobOrderId, clientId, invoiceId, details }) {
  const dedupe = `${kind}:${key}`;
  const q = db || { query };
  const { rows } = await q.query(
    `INSERT INTO exceptions(kind, severity, dedupe_key, job_order_id, client_id, invoice_id, message, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (dedupe_key) WHERE status='open'
     DO UPDATE SET last_seen_at=now(), message=EXCLUDED.message, details=EXCLUDED.details, severity=EXCLUDED.severity
     RETURNING *, (xmax = 0) AS inserted`,
    [kind, severity, dedupe, jobOrderId ?? null, clientId ?? null, invoiceId ?? null, message, details ? JSON.stringify(details) : null],
  );
  if (rows[0].inserted) await audit(q, null, 'exception.raised', 'exception', rows[0].id, { after: { kind, message } });
  return rows[0];
}

/** Sync-owned exceptions not re-observed since `since` are auto-resolved (condition cleared at source). */
export async function autoResolveStale(db, kinds, since) {
  const { rows } = await db.query(
    `UPDATE exceptions SET status='resolved', resolved_at=now(), resolution='Condition no longer present after successful sync'
     WHERE status='open' AND kind = ANY($1) AND last_seen_at < $2 RETURNING id, kind`,
    [kinds, since],
  );
  for (const r of rows) await audit(db, null, 'exception.auto_resolved', 'exception', r.id, { after: { kind: r.kind } });
  return rows.length;
}

export async function resolveException(id, actor, resolution) {
  if (!resolution?.trim()) throw Object.assign(new Error('A resolution note is required'), { status: 400 });
  const { rows } = await query(
    `UPDATE exceptions SET status='resolved', resolved_at=now(), resolved_by=$2, resolution=$3 WHERE id=$1 AND status='open' RETURNING *`,
    [id, actor.id, resolution],
  );
  if (!rows.length) throw Object.assign(new Error('Exception not found or already resolved'), { status: 404 });
  await audit(null, actor, 'exception.resolved', 'exception', id, { after: { resolution }, reason: resolution });
  return rows[0];
}

export async function openExceptionsFor(db, { jobOrderId, clientId, kinds }) {
  const { rows } = await (db || { query }).query(
    `SELECT * FROM exceptions WHERE status='open'
       AND ($1::int IS NULL OR job_order_id=$1) AND ($2::int IS NULL OR client_id=$2)
       AND ($3::text[] IS NULL OR kind = ANY($3))`,
    [jobOrderId ?? null, clientId ?? null, kinds ?? null],
  );
  return rows;
}
