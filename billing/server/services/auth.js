import { query } from '../db.js';
import { config, ROLES } from '../config.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../lib/crypto.js';
import { audit } from './audit.js';
import { badRequest, conflict, forbidden } from '../lib/errors.js';

export async function login(email, password) {
  const { rows: [u] } = await query('SELECT * FROM users WHERE lower(email)=lower($1) AND active', [email || '']);
  if (!u || !verifyPassword(password || '', u.password_hash)) return null;
  const token = randomToken();
  await query(`INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(hours => $3))`, [sha256(token), u.id, config.sessionTtlHours]);
  await audit(null, { type: 'user', id: u.id, label: u.email }, 'auth.login', 'user', u.id);
  return { token, user: publicUser(u) };
}

export async function logout(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
}

export async function userForToken(token) {
  if (!token) return null;
  const { rows: [u] } = await query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`, [sha256(token)]);
  return u ? publicUser(u) : null;
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, roles: u.roles, active: u.active });

export async function createUser({ email, name, password, roles }, actor) {
  if (!email || !name || !password) throw badRequest('email, name and password are required');
  if (password.length < 10) throw badRequest('Password must be at least 10 characters');
  const bad = (roles || []).filter((r) => !ROLES.includes(r));
  if (bad.length) throw badRequest(`Unknown roles: ${bad.join(', ')}`);
  try {
    const { rows: [u] } = await query('INSERT INTO users(email, name, password_hash, roles) VALUES ($1,$2,$3,$4) RETURNING *', [email.toLowerCase(), name, hashPassword(password), roles || []]);
    await audit(null, actor, 'user.created', 'user', u.id, { after: { email: u.email, roles: u.roles } });
    return publicUser(u);
  } catch (e) {
    if (e.code === '23505') throw conflict('A user with this email already exists');
    throw e;
  }
}

export async function updateUser(id, { roles, active, password, name }, actor) {
  const { rows: [u] } = await query('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw badRequest('User not found');
  if (roles) {
    const bad = roles.filter((r) => !ROLES.includes(r));
    if (bad.length) throw badRequest(`Unknown roles: ${bad.join(', ')}`);
    if (actor.id === u.id && !roles.includes('sysadmin') && u.roles.includes('sysadmin')) throw forbidden('You cannot remove your own administrator role');
  }
  const next = { roles: roles ?? u.roles, active: active ?? u.active, name: name ?? u.name };
  await query('UPDATE users SET roles=$2, active=$3, name=$4 WHERE id=$1', [id, next.roles, next.active, next.name]);
  if (password) {
    if (password.length < 10) throw badRequest('Password must be at least 10 characters');
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, hashPassword(password)]);
    await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  }
  if (!next.active) await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  await audit(null, actor, 'user.permissions_changed', 'user', id, { before: { roles: u.roles, active: u.active }, after: { roles: next.roles, active: next.active, passwordReset: !!password } });
  return { ...publicUser(u), ...next };
}
