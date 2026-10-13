import pg from 'pg';
import { config } from './config.js';

// Return DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and NUMERIC as strings.
pg.types.setTypeParser(1082, (v) => v);

let pool;
export function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  return pool;
}
export function setPool(p) { pool = p; }

export async function query(text, params) {
  return getPool().query(text, params);
}

/** Run fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Session-level advisory lock so only one instance runs a given job at a time. */
export async function withAdvisoryLock(key, fn) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [key]);
    if (!rows[0].ok) return { locked: false };
    try {
      return { locked: true, result: await fn() };
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
    }
  } finally {
    client.release();
  }
}
