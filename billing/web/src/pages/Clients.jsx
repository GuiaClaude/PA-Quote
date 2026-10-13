import React, { useState } from 'react';
import { useLoad, Table, Badge, peso, pesoStr, Err, Action, Field, hasRole, useForm, todayManila } from '../ui.jsx';
import { api } from '../api.js';
import { go } from '../App.jsx';
import { FormModal } from './JobOrders.jsx';

const BLANK = { client_code: '', registered_name: '', trade_name: '', billing_contact: '', ap_contact_name: '', approved_billing_email: '', additional_recipients: '',
  billing_address: '', payment_terms_days: '', credit_limit: '', preferred_payment_method: '', payment_instructions: '', collection_notes: '', account_status: 'active' };

function ClientForm({ client, onClose, onDone }) {
  const [v, , bind] = useForm(client ? { ...client, additional_recipients: (client.additional_recipients || []).join(', ') } : BLANK);
  const payload = () => ({ ...v, additional_recipients: String(v.additional_recipients || '').split(/[,;\s]+/).filter(Boolean),
    payment_terms_days: v.payment_terms_days === '' ? null : Number(v.payment_terms_days), credit_limit: v.credit_limit === '' ? null : v.credit_limit });
  return (
    <FormModal title={client ? `Edit ${client.registered_name}` : 'New client'} onClose={onClose} onDone={onDone}
      submit={() => (client ? api.put(`/clients/${client.id}`, payload()) : api.post('/clients', payload()))}>
      {!client && <Field label="Client ID / code"><input {...bind('client_code')} /></Field>}
      <Field label="Registered company name"><input {...bind('registered_name')} /></Field>
      <Field label="Trade name"><input {...bind('trade_name')} /></Field>
      <Field label="Billing contact"><input {...bind('billing_contact')} /></Field>
      <Field label="Accounts Payable contact"><input {...bind('ap_contact_name')} /></Field>
      <Field label="Approved billing email"><input type="email" {...bind('approved_billing_email')} /></Field>
      <Field label="Additional authorized recipients (comma separated)"><input {...bind('additional_recipients')} /></Field>
      <Field label="Billing address"><input {...bind('billing_address')} /></Field>
      <Field label="Payment terms (days)"><input type="number" {...bind('payment_terms_days')} /></Field>
      <Field label="Credit limit"><input {...bind('credit_limit')} /></Field>
      <Field label="Preferred payment method"><input {...bind('preferred_payment_method')} /></Field>
      <Field label="Account status"><select {...bind('account_status')}><option>active</option><option>on_hold</option><option>disputed</option><option>closed</option></select></Field>
      <Field label="Client-specific payment instructions (blank = company default)"><textarea {...bind('payment_instructions')} style={{ minHeight: 60 }} /></Field>
      <Field label="Collection notes"><textarea {...bind('collection_notes')} style={{ minHeight: 60 }} /></Field>
    </FormModal>
  );
}

export default function Clients({ user }) {
  const { data, error, reload } = useLoad('/clients');
  const [adding, setAdding] = useState(false);
  return (
    <div className="card">
      <div className="spread"><h2>Client Master</h2>{hasRole(user, 'accounting') && <button className="btn primary" onClick={() => setAdding(true)}>New client</button>}</div>
      <Err error={error} />
      <Table rows={data} onRow={(r) => go(`clients/${r.id}`)} columns={[
        { key: 'client_code', label: 'ID' }, { key: 'registered_name', label: 'Registered name' }, { key: 'trade_name', label: 'Trade name' },
        { key: 'approved_billing_email', label: 'Billing email' }, { label: 'Status', render: (r) => <Badge>{r.account_status}</Badge> },
        { label: 'Outstanding', num: true, render: (r) => peso(r.totals?.outstanding) }, { label: 'Overdue', num: true, render: (r) => peso(r.totals?.overdue) },
        { label: 'Sheet aliases', render: (r) => (r.aliases || []).join('; ') },
      ]} />
      {adding && <ClientForm onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}

export function ClientDetail({ id, user }) {
  const [asOf, setAsOf] = useState(todayManila());
  const [basis, setBasis] = useState('as_known');
  const { data, error, reload } = useLoad(`/clients/${id}?asOf=${asOf}&basis=${basis}`);
  const [edit, setEdit] = useState(false);
  const [alias, setAlias] = useState('');
  if (error) return <Err error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const { client: c, ledger: l } = data;
  const acct = hasRole(user, 'accounting');
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><a href="#/clients">← Clients</a></div>
      <div className="grid2">
        <div className="card">
          <div className="spread"><h2>{c.registered_name}</h2>{acct && <button className="btn" onClick={() => setEdit(true)}>Edit</button>}</div>
          <dl className="kv">
            <dt>Client ID</dt><dd>{c.client_code}</dd><dt>Trade name</dt><dd>{c.trade_name || '—'}</dd>
            <dt>AP contact</dt><dd>{c.ap_contact_name || '—'}</dd><dt>Approved billing email</dt><dd>{c.approved_billing_email || <Badge tone="bad">missing – drafts blocked</Badge>}</dd>
            <dt>Other recipients</dt><dd>{c.additional_recipients.join(', ') || '—'}</dd><dt>Billing address</dt><dd>{c.billing_address || '—'}</dd>
            <dt>Payment terms</dt><dd>{c.payment_terms_days != null ? `${c.payment_terms_days} days` : '—'}</dd><dt>Credit limit</dt><dd>{pesoStr(c.credit_limit)}</dd>
            <dt>Status</dt><dd><Badge>{c.account_status}</Badge></dd><dt>Collection notes</dt><dd>{c.collection_notes || '—'}</dd>
          </dl>
          <h3>Sheet name aliases (validated matching)</h3>
          <div className="small muted">Job orders link to this client only when the sheet's client name matches an alias added here.</div>
          <div className="row" style={{ margin: '6px 0' }}>{data.aliases.map((a) => <Badge key={a.alias_normalized}>{a.alias_display}</Badge>)}</div>
          {acct && <div className="row"><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Exact client name as in sheet" />
            <Action label="Add alias" run={() => api.post(`/clients/${c.id}/aliases`, { alias })} onDone={() => { setAlias(''); reload(); }} /></div>}
        </div>
        <div className="card">
          <div className="spread"><h2>Account position</h2>
            <div className="row"><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              <select value={basis} onChange={(e) => setBasis(e.target.value)}><option value="as_known">As recorded on that date</option><option value="restated">Restated (today's knowledge)</option></select></div></div>
          <dl className="kv">
            <dt>Total outstanding</dt><dd><b>{peso(l.totals.outstanding)}</b></dd><dt>Not yet due</dt><dd>{peso(l.totals.notYetDue)}</dd>
            <dt>Overdue</dt><dd>{peso(l.totals.overdue)}</dd><dt>1–30 / 31–60</dt><dd>{peso(l.totals.d1_30)} / {peso(l.totals.d31_60)}</dd>
            <dt>61–90 / &gt;90</dt><dd>{peso(l.totals.d61_90)} / {peso(l.totals.d90_plus)}</dd>
            <dt>Unapplied payments</dt><dd>{peso(l.totals.unapplied)}</dd><dt>Unverified claims</dt><dd>{peso(l.totals.unverifiedClaims)} <span className="muted small">(not counted)</span></dd>
          </dl>
          {acct && <div className="row" style={{ marginTop: 10 }}>
            <Action className="btn primary" label="Generate SOA" run={() => api.post('/soa', { clientId: c.id, statementDate: asOf, basis })} onDone={() => go('statements')} />
            <Action label="Full-history SOA" run={() => api.post('/soa', { clientId: c.id, statementDate: asOf, basis, mode: 'full_history' })} onDone={() => go('statements')} />
          </div>}
        </div>
      </div>
      <div className="card"><h2>Invoices as of {asOf}</h2>
        <Table rows={l.invoices} columns={[{ key: 'invoiceNumber', label: 'Invoice' }, { key: 'invoiceDate', label: 'Date' }, { key: 'dueDate', label: 'Due' },
          { key: 'original', label: 'Original', money: true, num: true }, { key: 'paymentsAndCredits', label: 'Payments/credits', money: true, num: true },
          { key: 'outstanding', label: 'Outstanding', money: true, num: true }, { key: 'daysOverdue', label: 'Days overdue', num: true }]} />
      </div>
      <div className="card"><h2>Payments</h2>
        <Table rows={data.payments} columns={[{ key: 'payment_date', label: 'Date' }, { label: 'Amount', num: true, render: (r) => pesoStr(r.amount) }, { key: 'method', label: 'Method' },
          { key: 'reference_no', label: 'Reference' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }]} />
      </div>
      {edit && <ClientForm client={c} onClose={() => setEdit(false)} onDone={reload} />}
    </>
  );
}
