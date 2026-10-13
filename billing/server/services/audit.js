import { query } from '../db.js';

export const SYSTEM = { type: 'system', id: null, label: 'system' };
export const userActor = (u) => ({ type: 'user', id: u.id, label: u.email });

/**
 * Append an immutable audit record. `db` may be a transaction client.
 */
export async function audit(db, actor, action, entityType, entityId, { before, after, reason, related } = {}) {
  const a = actor || SYSTEM;
  await (db || { query }).query(
    `INSERT INTO audit_log(actor_type, actor_id, actor_label, action, entity_type, entity_id, before, after, reason, related)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [a.type, a.id, a.label, action, entityType, entityId == null ? null : String(entityId),
      before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after),
      reason || null, related ? JSON.stringify(related) : null],
  );
}
