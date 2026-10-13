import React, { useState } from 'react';
import { useLoad, Table, Badge, peso, pesoStr, SyncBanner, Err, Action, Field, hasRole, dt, useForm, Modal } from '../ui.jsx';
import { api } from '../api.js';
import { go } from '../App.jsx';

export default function JobOrders() {
  const initialStage = new URLSearchParams(window.location.hash.split('?')[1] || '').get('stage') || '';
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(initialStage);
  const [unpaid, setUnpaid] = useState(false);
  const { data, error } = useLoad(`/job-orders?q=${encodeURIComponent(q)}&stage=${encodeURIComponent(stage)}&unpaid=${unpaid ? 1 : ''}`);
  return (
    <>
      <SyncBanner sync={data?.sync} />
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <input placeholder="Search JO, client, project, invoice…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {['Job Order Created', 'In Production', 'Completed', 'Delivered', 'Awaiting Billing', 'Billed', 'Invoice Sent', 'Awaiting Payment', 'Partially Paid', 'Paid'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="row small"><input type="checkbox" checked={unpaid} onChange={(e) => setUnpaid(e.target.checked)} /> Not marked Paid</label>
          <span className="muted small">{data?.items.length ?? 0} records</span>
        </div>
        <Err error={error} />
        <Table rows={data?.items} onRow={(r) => go(`job-orders/${r.id}`)} columns={[
          { key: 'jo_number', label: 'Job Order' },
          { label: 'Client', render: (r) => <>{r.client} {!r.client_linked && <Badge tone="warn">unlinked</Badge>}</> },
          { key: 'project_name', label: 'Project' },
          { label: 'Stage', render: (r) => <><Badge>{r.stage}</Badge> {r.exception && <Badge tone="bad">{r.exception}</Badge>} {!r.source_present && <Badge tone="bad">not in sheet</Badge>}</> },
          { key: 'invoice_number', label: 'Invoice' },
          { key: 'payment_status', label: 'Sheet payment status' },
          { key: 'billing_amount', label: 'Billed (sheet)', money: true, num: true },
          { key: 'outstanding', label: 'Ledger outstanding', money: true, num: true },
          { label: 'Overdue', num: true, render: (r) => (r.flags.overdue ? <span style={{ color: 'var(--bad)' }}>{r.days_overdue}d</span> : '') },
        ]} />
      </div>
    </>
  );
}

export function JobOrderDetail({ id, user }) {
  const { data, error, reload } = useLoad(`/job-orders/${id}`);
  const [modal, setModal] = useState(null);
  if (error) return <Err error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const { jobOrder: j, tracking: t, balance: b } = data;
  const acct = hasRole(user, 'accounting');
  return (
    <>
      <SyncBanner sync={data.sync} />
      <div className="row" style={{ marginBottom: 12 }}><a href="#/job-orders">← Job orders</a></div>
      <div className="grid2">
        <div className="card">
          <div className="spread"><h2>JO {j.jo_number}</h2><div className="row"><Badge>{t.stage}</Badge>{t.exception && <Badge tone="bad">{t.exception}</Badge>}{t.flags.overdue && <Badge tone="bad">Overdue</Badge>}</div></div>
          <dl className="kv">
            <dt>Client</dt><dd>{j.client_id ? <a href={`#/clients/${j.client_id}`}>{j.client_name}</a> : <>{j.client_name_source} <Badge tone="warn">not linked to Client Master</Badge></>}</dd>
            <dt>Project</dt><dd>{j.project_name || '—'}</dd>
            <dt>Description</dt><dd>{j.description || '—'}</dd>
            <dt>Delivery</dt><dd>{j.delivery_status || '—'} {j.delivery_date && `· ${j.delivery_date}`}</dd>
            <dt>Invoice (sheet)</dt><dd>{j.invoice_number_source || '—'} {j.billing_date_source && `· ${j.billing_date_source}`}</dd>
            <dt>Billing amount (sheet)</dt><dd>{pesoStr(j.billing_amount_source)}</dd>
            <dt>Payment terms</dt><dd>{j.payment_terms_source || '—'}</dd>
            <dt>Due date (sheet)</dt><dd>{j.due_date_source || '—'}</dd>
            <dt>Payment status (master)</dt><dd><b>{j.payment_status_source || '—'}</b> {j.is_paid_in_source && <Badge tone="ok">Paid</Badge>}</dd>
            <dt>Sheet remarks</dt><dd>{j.remarks_source || '—'}</dd>
            <dt>Assigned staff</dt><dd>{j.assigned_staff_source || '—'}</dd>
            <dt>Staff remarks (app)</dt><dd>{j.staff_remarks || '—'}</dd>
            <dt>Billable status</dt><dd>{j.billable_status.replace(/_/g, ' ')} {j.billing_terms_note && `· ${j.billing_terms_note}`}</dd>
            <dt>Next follow-up</dt><dd>{j.next_followup_date || 'Next Monday run (until marked Paid)'}</dd>
            <dt>Source row (last seen)</dt><dd className="muted">{j.source_present ? `row ${j.source_row_number}` : 'not in sheet'} · identity is the JO number</dd>
          </dl>
          {acct && <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setModal('edit')}>Edit app fields</button>
            <button className="btn" onClick={() => setModal('writeback')}>Propose sheet update</button>
            <button className="btn" onClick={() => setModal('promise')}>Record payment promise</button>
            <button className="btn" onClick={() => setModal('note')}>Add note</button>
            <Action label="Create collection draft" run={() => api.post('/drafts', { jobOrderId: j.id })} onDone={(d) => go(`approvals/${d.id}`)} />
          </div>}
        </div>
        <div className="card">
          <h2>Ledger position</h2>
          {!b.hasLedger && <div className="alert warn">No reconciled invoice in the ledger for this job order.{b.unreconciled?.length ? ` Pending reconciliation: ${b.unreconciled.map((i) => i.invoice_number).join(', ')}.` : ''}</div>}
          <dl className="kv">
            <dt>Invoice amount</dt><dd>{peso(b.original)}</dd>
            <dt>Verified payments allocated</dt><dd>{peso(b.paid)}</dd>
            <dt>Approved credits</dt><dd>{peso(b.credits)}</dd>
            <dt>Outstanding</dt><dd><b>{peso(b.outstanding)}</b></dd>
            <dt>Overdue</dt><dd>{peso(b.overdue)} {b.maxDaysOverdue > 0 && `(${b.maxDaysOverdue} days)`}</dd>
          </dl>
          <h3>Invoices</h3>
          <Table rows={data.invoices} columns={[{ key: 'invoice_number', label: 'Invoice' }, { key: 'invoice_date', label: 'Date' }, { key: 'due_date', label: 'Due' },
            { label: 'Amount', num: true, render: (r) => pesoStr(r.amount) }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { label: 'Sent', render: (r) => (r.sent_confirmed_at ? 'confirmed' : '—') }]} />
          {b.unverifiedClaims?.length > 0 && <div className="alert warn" style={{ marginTop: 10 }}>Unverified payment claims on this account (not counted): {b.unverifiedClaims.map((c) => peso(c.amount)).join(', ')}</div>}
        </div>
      </div>
      <div className="card"><h2>Collection history</h2>
        <Table rows={data.drafts} onRow={(r) => go(`approvals/${r.id}`)} columns={[{ key: 'id', label: 'Draft' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { key: 'version', label: 'v' },
          { key: 'subject', label: 'Subject' }, { label: 'Outstanding', num: true, render: (r) => peso(r.amounts?.outstanding) }, { label: 'Created', render: (r) => dt(r.created_at) }, { label: 'Sent', render: (r) => dt(r.sent_at) }]} />
        <h3>Activities &amp; promises</h3>
        <Table rows={data.activities} columns={[{ label: 'When', render: (r) => dt(r.at) }, { key: 'kind', label: 'Kind' }, { key: 'note', label: 'Note' }, { key: 'actor', label: 'By' }]} />
      </div>
      <div className="grid2">
        <div className="card"><h2>Related statements</h2>
          <Table rows={data.soas} columns={[{ label: 'Statement', render: (r) => <a href={`/api/soa/${r.id}/pdf`} target="_blank" rel="noreferrer">{r.statement_number} v{r.version}</a> }, { key: 'statement_date', label: 'Date' },
            { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { label: 'Outstanding', num: true, render: (r) => peso(r.totals?.outstanding) }]} />
        </div>
        <div className="card"><h2>Approvals</h2>
          <Table rows={data.approvals} columns={[{ key: 'draft_id', label: 'Draft' }, { key: 'decision', label: 'Decision' }, { key: 'approver', label: 'By' }, { label: 'When', render: (r) => dt(r.decided_at) },
            { label: 'Valid', render: (r) => (r.invalidated_at ? <Badge tone="bad">invalidated</Badge> : '') }]} />
        </div>
      </div>
      <div className="card"><h2>Exceptions</h2>
        <Table rows={data.exceptions} columns={[{ label: 'Severity', render: (r) => <Badge>{r.severity}</Badge> }, { key: 'kind', label: 'Kind' }, { key: 'message', label: 'Message' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }]} />
        <h3>Sheet update requests</h3>
        <Table rows={data.writebacks} columns={[{ key: 'field', label: 'Field' }, { key: 'expected_value', label: 'Sheet value' }, { key: 'new_value', label: 'Proposed' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { key: 'error', label: 'Note' }]} />
        <h3>Change history</h3>
        <Table rows={data.audit} columns={[{ label: 'When', render: (r) => dt(r.at) }, { key: 'action', label: 'Action' }, { key: 'actor_label', label: 'By' }, { label: 'Before → after', render: (r) => <span className="mono">{JSON.stringify(r.before)} → {JSON.stringify(r.after)}</span> }]} />
      </div>
      {modal === 'edit' && <EditApp j={j} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'writeback' && <ProposeWriteback j={j} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'promise' && <Promise_ j={j} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'note' && <Note j={j} onClose={() => setModal(null)} onDone={reload} />}
    </>
  );
}

function FormModal({ title, onClose, onDone, submit, children }) {
  const [err, setErr] = useState(null);
  return (
    <Modal title={title} onClose={onClose}>
      <Err error={err} />
      <form onSubmit={async (e) => { e.preventDefault(); try { await submit(); onDone(); onClose(); } catch (x) { setErr(x); } }}>
        <div className="form">{children}</div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function EditApp({ j, onClose, onDone }) {
  const [v, , bind] = useForm({ exception_state: j.exception_state || '', billable_status: j.billable_status, billing_terms_note: j.billing_terms_note || '', next_followup_date: j.next_followup_date || '', staff_remarks: j.staff_remarks || '', reason: '' });
  return (
    <FormModal title="Edit application-managed fields" onClose={onClose} onDone={onDone} submit={() => api.patch(`/job-orders/${j.id}`, {
      exception_state: v.exception_state || null, billable_status: v.billable_status, billing_terms_note: v.billing_terms_note || null,
      next_followup_date: v.next_followup_date || null, staff_remarks: v.staff_remarks || null, reason: v.reason })}>
      <Field label="Exception"><select {...bind('exception_state')}><option value="">None</option><option value="on_hold">On Hold</option><option value="disputed">Disputed</option><option value="cancelled">Cancelled</option><option value="for_verification">For Verification</option></select></Field>
      <Field label="Billable status"><select {...bind('billable_status')}><option value="per_source">Per sheet (delivered = billable)</option><option value="billable">Billable now</option><option value="not_yet_billable">Not yet billable (milestone/terms)</option><option value="not_billable">Not billable</option></select></Field>
      <Field label="Billing terms note"><input {...bind('billing_terms_note')} /></Field>
      <Field label="Next follow-up date"><input type="date" {...bind('next_followup_date')} /></Field>
      <Field label="Staff remarks"><input {...bind('staff_remarks')} /></Field>
      <Field label="Reason (required for status changes)"><input {...bind('reason')} /></Field>
    </FormModal>
  );
}

function ProposeWriteback({ j, onClose, onDone }) {
  const [v, , bind] = useForm({ field: 'invoice_number', newValue: '', reason: '' });
  const current = { invoice_number: j.invoice_number_source, billing_date: j.billing_date_source, billing_amount: j.billing_amount_source, due_date: j.due_date_source,
    payment_terms: j.payment_terms_source, payment_status: j.payment_status_source, amount_paid: j.amount_paid_source, remarks: j.remarks_source }[v.field];
  return (
    <FormModal title="Propose an update to the Job Order List" onClose={onClose} onDone={onDone} submit={() => api.post('/writebacks', { jobOrderId: j.id, ...v })}>
      <Field label="Field"><select {...bind('field')}>{['invoice_number', 'billing_date', 'billing_amount', 'due_date', 'payment_terms', 'payment_status', 'amount_paid', 'remarks'].map((f) => <option key={f}>{f}</option>)}</select></Field>
      <Field label="Current sheet value"><input value={current ?? ''} disabled /></Field>
      <Field label="New value"><input {...bind('newValue')} placeholder={/date/.test(v.field) ? 'YYYY-MM-DD' : ''} /></Field>
      <Field label="Reason"><input {...bind('reason')} /></Field>
      <div className="small muted" style={{ gridColumn: '1/-1' }}>An approver reviews the change on the Sheet Updates screen. It is written to that single cell only if the sheet still shows the current value.</div>
    </FormModal>
  );
}

function Promise_({ j, onClose, onDone }) {
  const [v, , bind] = useForm({ promisedDate: '', amount: '', note: '' });
  return (
    <FormModal title="Record payment promise" onClose={onClose} onDone={onDone} submit={() => api.post(`/job-orders/${j.id}/promises`, v)}>
      <Field label="Promised date"><input type="date" {...bind('promisedDate')} /></Field>
      <Field label="Amount (optional)"><input {...bind('amount')} /></Field>
      <Field label="Note"><input {...bind('note')} /></Field>
      <div className="small muted" style={{ gridColumn: '1/-1' }}>A promise is acknowledged in the next reminder; weekly drafts continue until the job order is marked Paid.</div>
    </FormModal>
  );
}

function Note({ j, onClose, onDone }) {
  const [v, , bind] = useForm({ kind: 'note', note: '' });
  return (
    <FormModal title="Add collection note" onClose={onClose} onDone={onDone} submit={() => api.post(`/job-orders/${j.id}/activities`, v)}>
      <Field label="Kind"><select {...bind('kind')}><option value="note">Note</option><option value="call">Call</option><option value="escalation">Escalation</option></select></Field>
      <Field label="Note"><input {...bind('note')} /></Field>
    </FormModal>
  );
}
export { FormModal };
