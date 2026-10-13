import { query } from '../db.js';

/** In-app notification to everyone holding a role (and optional email via Gmail adapter later). */
export async function notifyRole(role, kind, message, link) {
  await query('INSERT INTO notifications(role, kind, message, link) VALUES ($1,$2,$3,$4)', [role, kind, message, link || null]);
}

export async function listNotifications(user) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE (user_id=$1 OR role = ANY($2)) ORDER BY created_at DESC LIMIT 100`,
    [user.id, user.roles],
  );
  return rows;
}
