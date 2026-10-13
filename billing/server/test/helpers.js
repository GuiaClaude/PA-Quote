// Test harness: real PostgreSQL (TEST_DATABASE_URL) + in-memory fakes of the Google APIs.
// All data created here is clearly labelled test data and lives only in the test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/pa_billing_test';
process.env.APP_ENCRYPTION_KEY ||= '0'.repeat(64);

const { getPool, query } = await import('../db.js');
const { migrate } = await import('../migrate.js');
const { setIntegrationsOverride, IntegrationError } = await import('../google/index.js');
const { setSetting } = await import('../services/settings.js');
const { createUser } = await import('../services/auth.js');

export { query };

export async function resetDb() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
}

export const HEADERS = ['JO No.', 'Client', 'Project', 'Delivery Status', 'Date Delivered', 'Invoice #', 'Invoice Date', 'Amount Billed', 'Due Date', 'Amount Paid', 'Payment Status', 'Remarks'];
export const MAPPING = {
  jo_number: 'JO No.', client_name: 'Client', project_name: 'Project', delivery_status: 'Delivery Status', delivery_date: 'Date Delivered',
  invoice_number: 'Invoice #', billing_date: 'Invoice Date', billing_amount: 'Amount Billed', due_date: 'Due Date', amount_paid: 'Amount Paid',
  payment_status: 'Payment Status', remarks: 'Remarks',
};

/** Row helper: object keyed by header → array in header order. */
export const row = (o) => HEADERS.map((h) => (o[h] === undefined ? '' : o[h]));

export class FakeSheets {
  constructor(values) { this.values = values; this.formulas = new Map(); this.fail = null; this.writes = []; }
  async getMetadata() { return { title: 'TEST Job Order List', tabs: [{ title: 'JO List' }, { title: 'Notes' }] }; }
  async getValues() {
    if (this.fail) throw new IntegrationError('sheets', this.fail);
    return JSON.parse(JSON.stringify(this.values));
  }
  async getCell(_id, _tab, a1) {
    const { r, c } = parseA1(a1);
    return { formula: this.formulas.get(a1) || null, value: this.values[r]?.[c] ?? null };
  }
  async updateCell(_id, _tab, a1, value) {
    const { r, c } = parseA1(a1);
    while (this.values[r].length <= c) this.values[r].push('');
    this.values[r][c] = value;
    this.writes.push({ a1, value });
    return { updatedRange: `'JO List'!${a1}` };
  }
}
function parseA1(a1) {
  const m = a1.match(/^([A-Z]+)(\d+)$/);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

export class FakeDrive {
  constructor() { this.files = []; this.fail = null; }
  async createFolder(name) { return { id: 'folder-test', name }; }
  async getFile(id) { return { id }; }
  async uploadPdf({ folderId, name, buffer }) {
    if (this.fail) throw new IntegrationError('drive', this.fail);
    const f = { id: `file-${this.files.length + 1}`, webViewLink: `https://drive.test/${this.files.length + 1}`, folderId, name, size: buffer.length };
    this.files.push(f);
    return f;
  }
}

export class FakeGmail {
  constructor() { this.account = 'billing@test.invalid'; this.drafts = new Map(); this.sent = []; this.n = 0; this.failMode = null; }
  async profile() { return { emailAddress: this.account }; }
  async createDraft(raw) { const id = `d${++this.n}`; this.drafts.set(id, raw); return { id }; }
  async updateDraft(id, raw) { this.drafts.set(id, raw); return { id }; }
  async draftExists(id) { return this.drafts.has(id); }
  async sendDraft(id) {
    const raw = this.drafts.get(id);
    if (this.failMode === 'reject') throw new IntegrationError('gmail', 'Invalid To header', { uncertain: false });
    if (this.failMode === 'timeout_after_send') { this.#deliver(id, raw); throw new IntegrationError('gmail', 'socket hang up', { uncertain: true }); }
    if (this.failMode === 'timeout_before_send') throw new IntegrationError('gmail', 'ETIMEDOUT', { uncertain: true });
    return this.#deliver(id, raw);
  }
  #deliver(id, raw) {
    this.drafts.delete(id);
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const key = decoded.match(/X-PA-Send-Key: (\S+)/)?.[1];
    const m = { id: `m${this.sent.length + 1}`, threadId: `t${this.sent.length + 1}`, key, decoded };
    this.sent.push(m);
    return { id: m.id, threadId: m.threadId };
  }
  async sendMessage(raw) { this.sent.push({ id: `n${this.sent.length + 1}`, internal: true, decoded: Buffer.from(raw, 'base64url').toString('utf8') }); return {}; }
  async findSentBySendKey(key) { const m = this.sent.find((x) => x.key === key); return m ? { id: m.id, threadId: m.threadId } : null; }
}

export async function setup({ values } = {}) {
  await resetDb();
  const sheets = new FakeSheets(JSON.parse(JSON.stringify(values || [HEADERS])));
  const drive = new FakeDrive();
  const gmail = new FakeGmail();
  setIntegrationsOverride({ connected: true, account: gmail.account, sheets, drive, gmail });
  const sys = { type: 'system', id: null, label: 'test' };
  await setSetting('sheet', {
    spreadsheetId: 'TEST-SHEET', tabName: 'JO List', headerRow: 1, dateOrder: 'MDY', mapping: MAPPING,
    writableFields: ['invoice_number', 'billing_date', 'billing_amount', 'due_date', 'payment_status'],
    paidValues: ['Paid'], partiallyPaidValues: ['Partial'], deliveredValues: ['Delivered'], completedValues: ['Completed'],
    cancelledValues: ['Cancelled'], onHoldValues: ['On Hold'], disputedValues: ['Disputed'],
  }, sys);
  await setSetting('paymentInstructions', 'TEST payment instructions – not real bank details', sys);
  await setSetting('soaFolderId', 'folder-test', sys);
  await setSetting('company', { name: 'Print Amplified OPC', address: 'TEST ADDRESS', phone: '', email: '', tin: '' }, sys);
  const mk = (email, roles) => createUser({ email, name: email.split('@')[0], password: 'test-password-123', roles }, sys);
  const users = {
    staff: await mk('staff@test.invalid', ['accounting']),
    staff2: await mk('staff2@test.invalid', ['accounting']),
    approver: await mk('approver@test.invalid', ['approver']),
    sender: await mk('sender@test.invalid', ['sender']),
    mgmt: await mk('mgmt@test.invalid', ['management']),
    admin: await mk('admin@test.invalid', ['sysadmin']),
  };
  for (const u of Object.values(users)) Object.assign(u, { type: 'user', label: u.email });
  return { sheets, drive, gmail, users };
}

/** Create a test client and alias so sheet rows match it. */
export async function makeClient({ code = 'TST1', name = 'TEST Client Alpha Inc', email = 'ap@alpha.test.invalid', alias } = {}) {
  const { rows: [c] } = await query(
    `INSERT INTO clients(client_code, registered_name, ap_contact_name, approved_billing_email, billing_address, payment_terms_days) VALUES ($1,$2,'TEST AP Contact',$3,'TEST billing address',30) RETURNING *`,
    [code, name, email]);
  const { normName } = await import('../domain/sheetParse.js');
  await query('INSERT INTO client_aliases(alias_normalized, alias_display, client_id) VALUES ($1,$2,$3)', [normName(alias || name), alias || name, c.id]);
  return c;
}

export async function closePool() { await getPool().end(); }
