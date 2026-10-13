// HTTP-level checks: authentication, CSRF header, role enforcement, secrets never exposed.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, closePool, query } from './helpers.js';

const { createApp } = await import('../app.js');
process.env.COOKIE_SECURE = 'false';

let server; let base;
after(async () => { server?.close(); await closePool(); });

async function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'pa-billing', ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { call, login: (email) => call('POST', '/api/auth/login', { email, password: 'test-password-123' }) };
}

test('API enforces authentication, CSRF header and roles', async () => {
  await setup();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const anon = await client();
  assert.equal((await anon.call('GET', '/api/dashboard')).status, 401);
  assert.equal((await anon.call('POST', '/api/auth/login', { email: 'staff@test.invalid', password: 'wrong' })).status, 401);

  const staff = await client();
  assert.equal((await staff.login('staff@test.invalid')).status, 200);
  assert.equal((await staff.call('GET', '/api/dashboard')).status, 200);
  // Missing CSRF header → rejected even with a valid session
  assert.equal((await staff.call('POST', '/api/sync', {}, { 'x-requested-with': '' })).status, 403);
  // Staff cannot approve, send, change settings or users
  assert.equal((await staff.call('POST', '/api/drafts/1/decide', { decision: 'approve' })).status, 403);
  assert.equal((await staff.call('POST', '/api/drafts/1/send')).status, 403);
  assert.equal((await staff.call('PUT', '/api/settings/policy', { value: { allowSelfApproval: true } })).status, 403);
  assert.equal((await staff.call('PATCH', '/api/users/1', { roles: ['sysadmin'] })).status, 403);

  // Sysadmin cannot approve or send (admin access does not bypass approval controls)
  const admin = await client();
  await admin.login('admin@test.invalid');
  assert.equal((await admin.call('POST', '/api/drafts/1/decide', { decision: 'approve' })).status, 403);
  assert.equal((await admin.call('POST', '/api/drafts/1/send')).status, 403);
  // Role change is audited
  const { rows: [u] } = await query(`SELECT id FROM users WHERE email='staff2@test.invalid'`);
  assert.equal((await admin.call('PATCH', `/api/users/${u.id}`, { roles: ['accounting', 'approver'] })).status, 200);
  assert.equal((await query(`SELECT count(*)::int n FROM audit_log WHERE action='user.permissions_changed'`)).rows[0].n, 1);

  // Integration status never includes tokens
  const integ = await admin.call('GET', '/api/integrations');
  assert.equal(integ.status, 200);
  assert.ok(!JSON.stringify(integ.body).match(/refresh|token_enc|secret/i));

  // Cron endpoint requires the shared secret
  assert.equal((await anon.call('POST', '/api/cron/monday', {})).status, 403);
});
