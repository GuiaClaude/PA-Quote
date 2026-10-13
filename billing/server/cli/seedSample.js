// Seeds clearly labelled SAMPLE data for demos/training. Refuses to run unless ALLOW_SAMPLE_DATA=true
// AND the database contains no live (non-sample) clients or job orders. Never use on production.
import { migrate } from '../migrate.js';
import { query, tx, getPool } from '../db.js';
import { createUser } from '../services/auth.js';
import { setSetting, getSetting } from '../services/settings.js';
import { generateSoa } from '../services/soa.js';
import { composeDraft } from '../services/email.js';
import { manilaDate, addDays } from '../lib/dates.js';

if (process.env.ALLOW_SAMPLE_DATA !== 'true') { console.error('Set ALLOW_SAMPLE_DATA=true to seed sample data.'); process.exit(1); }
await migrate();
const { rows: [{ n }] } = await query(`SELECT (SELECT count(*) FROM clients WHERE NOT is_sample) + (SELECT count(*) FROM job_orders WHERE NOT is_sample) AS n`);
if (Number(n) > 0) { console.error('Refusing: this database contains live records. Use a separate demo database.'); process.exit(1); }
const pw = process.env.PA_SAMPLE_PASSWORD;
if (!pw || pw.length < 10) { console.error('Set PA_SAMPLE_PASSWORD (min 10 chars) for the sample users.'); process.exit(1); }

const sys = { type: 'system', id: null, label: 'sample-seed' };
const users = {};
for (const [k, roles] of Object.entries({ admin: ['sysadmin'], staff: ['accounting'], approver: ['approver', 'management'], sender: ['sender'] })) {
  const email = `sample.${k}@example.invalid`;
  const { rows: [ex] } = await query('SELECT * FROM users WHERE email=$1', [email]);
  users[k] = ex || (await createUser({ email, name: `Sample ${k}`, password: pw, roles }, sys));
}
if (!(await getSetting('paymentInstructions'))) await setSetting('paymentInstructions', '[SAMPLE] Payment instructions placeholder – replace with approved company bank details.', sys);

const t = manilaDate();
const D = (d) => addDays(t, d);
await tx(async (db) => {
  const mk = async (code, name, email) => (await db.query(`INSERT INTO clients(client_code, registered_name, trade_name, ap_contact_name, approved_billing_email, billing_address, payment_terms_days, is_sample)
    VALUES ($1,$2,$2,'[SAMPLE] AP Officer',$3,'[SAMPLE] address',30,TRUE) RETURNING *`, [code, name, email])).rows[0];
  const a = await mk('SMP-A', '[SAMPLE] Alpha Retail Corp', 'ap@alpha.example.invalid');
  const b = await mk('SMP-B', '[SAMPLE] Beta Foods Inc', null);
  const jo = async (no, c, proj, del, inv, amt, invDate, due, status) => (await db.query(`INSERT INTO job_orders(jo_number, client_id, client_name_source, project_name, delivery_status, delivery_date,
    invoice_number_source, billing_amount_source, billing_date_source, due_date_source, payment_status_source, is_paid_in_source, is_sample, source_present)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,TRUE) RETURNING *`, [no, c.id, c.registered_name, proj, del ? 'Delivered' : 'In Production', del, inv, amt, invDate, due, status, status === 'Paid'])).rows[0];
  const j1 = await jo('SMP-JO-001', a, '[SAMPLE] Product catalog', D(-60), 'SMP-INV-001', '48500.00', D(-55), D(-25), 'Unpaid');
  const j2 = await jo('SMP-JO-002', a, '[SAMPLE] Shelf talkers', D(-20), 'SMP-INV-002', '12750.00', D(-15), D(15), 'Partial');
  await jo('SMP-JO-003', b, '[SAMPLE] Packaging boxes', D(-3), null, null, null, null, 'Unbilled');
  await jo('SMP-JO-004', a, '[SAMPLE] Calendars', null, null, null, null, null, '');
  for (const [j, no, amt, d, due] of [[j1, 'SMP-INV-001', '48500.00', D(-55), D(-25)], [j2, 'SMP-INV-002', '12750.00', D(-15), D(15)]]) {
    const { rows: [i] } = await db.query(`INSERT INTO invoices(invoice_number, client_id, invoice_date, due_date, amount, status, source, is_sample, reconciled_by, reconciled_at, sent_confirmed_at)
      VALUES ($1,$2,$3,$4,$5,'issued','app',TRUE,$6,now(),now()) RETURNING *`, [no, a.id, d, due, amt, users.staff.id]);
    await db.query('INSERT INTO invoice_job_orders(invoice_id, job_order_id) VALUES ($1,$2)', [i.id, j.id]);
    if (no === 'SMP-INV-002') {
      const { rows: [p] } = await db.query(`INSERT INTO payments(client_id, payment_date, amount, method, reference_no, status, recorded_by, verified_by, verified_at, is_sample)
        VALUES ($1,$2,'5000.00','[SAMPLE] transfer','SMP-REF-1','verified',$3,$4,now(),TRUE) RETURNING *`, [a.id, D(-5), users.staff.id, users.approver.id]);
      await db.query(`INSERT INTO payment_allocations(payment_id, invoice_id, amount, effective_date, created_by) VALUES ($1,$2,'5000.00',$3,$4)`, [p.id, i.id, D(-5), users.staff.id]);
    }
  }
  await db.query(`INSERT INTO payments(client_id, payment_date, amount, method, reference_no, status, recorded_by, is_sample) VALUES ($1,$2,'20000.00','[SAMPLE] cheque','SMP-REF-2','claimed',$3,TRUE)`, [a.id, D(-1), users.staff.id]);
  await db.query(`INSERT INTO sync_runs(trigger, status, finished_at) VALUES ('sample','succeeded',now())`);
});
const { rows: [a] } = await query(`SELECT * FROM clients WHERE client_code='SMP-A'`);
const soa = await generateSoa({ clientId: a.id, actor: { type: 'user', id: users.staff.id, label: users.staff.email } });
soa.statement_date = t;
const { rows: [j1] } = await query(`SELECT * FROM job_orders WHERE jo_number='SMP-JO-001'`);
await tx((db) => composeDraft(db, { jo: j1, coveredJobOrders: [j1], soa, runId: null }));
console.log('Sample data seeded. Users: sample.{admin,staff,approver,sender}@example.invalid');
await getPool().end();
