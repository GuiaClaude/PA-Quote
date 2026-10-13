import React, { useState } from 'react';
import { useLoad, Table, Badge, pesoStr, Err, Action, Field, hasRole, useForm, todayManila } from '../ui.jsx';
import { api } from '../api.js';
import { FormModal } from './JobOrders.jsx';

export default function Ledger({ user }) {
  const [tab, setTab] = useState('invoices');
  return (
    <>
      <div className="tabs">{[['invoices', 'Invoices'], ['payments', 'Payments'], ['adjustments', 'Adjustments & credit notes']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'invoices' && <Invoices user={user} />}
      {tab === 'payments' && <Payments user={user} />}
      {tab === 'adjustments' && <Adjustments user={user} />}
    </>
  );
}

function Invoices({ user }) {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(`/invoices${status ? `?status=${status}` : ''}`);
  const [rec, setRec] = useState(null);
  const [create, setCreate] = useState(false);
  const acct = hasRole(user, 'accounting');
  return (
    <div className="card">
      <div className="spread"><div className="row"><h2 style={{ margin: 0 }}>Invoice register</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="unreconciled">Awaiting reconciliation</option><option value="issued">Reconciled</option><option value="void">Void</option></select></div>
        {acct && <button className="btn primary" onClick={() => setCreate(true)}>New invoice</button>}</div>
      <div className="small muted" style={{ margin: '6px 0 10px' }}>Each invoice number exists once, however many sheet rows mention it. Sheet-derived invoices enter statements only after staff reconcile them.</div>
      <Err error={error} />
      <Table rows={data} columns={[{ key: 'invoice_number', label: 'Invoice' }, { key: 'registered_name', label: 'Client' }, { label: 'Job orders', render: (r) => (r.job_orders || []).join(', ') },
        { key: 'invoice_date', label: 'Date' }, { key: 'due_date', label: 'Due' }, { label: 'Amount', num: true, render: (r) => pesoStr(r.amount) },
        { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { key: 'source', label: 'Source' },
        { label: '', render: (r) => acct && <div className="row">
          {r.status === 'unreconciled' && <button className="btn sm" onClick={() => setRec(r)}>Reconcile</button>}
          {r.status === 'issued' && !r.sent_confirmed_at && <Action className="btn sm" label="Confirm sent" run={() => api.post(`/invoices/${r.id}/confirm-sent`)} onDone={reload} />}
        </div> }]} />
      {rec && <Reconcile inv={rec} onClose={() => setRec(null)} onDone={reload} />}
      {create && <CreateInvoice onClose={() => setCreate(false)} onDone={reload} />}
    </div>
  );
}

function Reconcile({ inv, onClose, onDone }) {
  const clients = useLoad('/clients').data;
  const [v, , bind] = useForm({ amount: inv.amount, invoiceDate: inv.invoice_date || '', dueDate: inv.due_date || '', clientId: inv.client_id || '' });
  return (
    <FormModal title={`Reconcile ${inv.invoice_number}`} onClose={onClose} onDone={onDone} submit={() => api.post(`/invoices/${inv.id}/reconcile`, { ...v, clientId: v.clientId ? Number(v.clientId) : null })}>
      <div className="alert info" style={{ gridColumn: '1/-1' }}>Confirm these figures against the issued invoice document. Job orders: {(inv.job_orders || []).join(', ')}</div>
      <Field label="Client"><select {...bind('clientId')}><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.registered_name}</option>)}</select></Field>
      <Field label="Invoice total"><input {...bind('amount')} /></Field>
      <Field label="Invoice date"><input type="date" {...bind('invoiceDate')} /></Field>
      <Field label="Due date"><input type="date" {...bind('dueDate')} /></Field>
    </FormModal>
  );
}

function CreateInvoice({ onClose, onDone }) {
  const clients = useLoad('/clients').data;
  const jos = useLoad('/job-orders').data;
  const [v, , bind] = useForm({ invoiceNumber: '', clientId: '', invoiceDate: todayManila(), dueDate: '', amount: '', jobOrderId: '' });
  return (
    <FormModal title="New invoice" onClose={onClose} onDone={onDone} submit={() => api.post('/invoices', { ...v, clientId: Number(v.clientId), jobOrderIds: v.jobOrderId ? [Number(v.jobOrderId)] : [] })}>
      <Field label="Invoice number"><input {...bind('invoiceNumber')} /></Field>
      <Field label="Client"><select {...bind('clientId')}><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.registered_name}</option>)}</select></Field>
      <Field label="Job order"><select {...bind('jobOrderId')}><option value="">—</option>{jos?.items.map((j) => <option key={j.id} value={j.id}>{j.jo_number} – {j.client}</option>)}</select></Field>
      <Field label="Amount"><input {...bind('amount')} /></Field>
      <Field label="Invoice date"><input type="date" {...bind('invoiceDate')} /></Field>
      <Field label="Due date"><input type="date" {...bind('dueDate')} /></Field>
      <div className="small muted" style={{ gridColumn: '1/-1' }}>To record the invoice number in the Job Order List as well, propose a sheet update from the job order.</div>
    </FormModal>
  );
}

function Payments({ user }) {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(`/payments${status ? `?status=${status}` : ''}`);
  const [rec, setRec] = useState(false);
  const [alloc, setAlloc] = useState(null);
  const acct = hasRole(user, 'accounting');
  const checker = hasRole(user, 'accounting', 'approver');
  return (
    <div className="card">
      <div className="spread"><div className="row"><h2 style={{ margin: 0 }}>Payments</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="claimed">Awaiting verification</option><option value="verified">Verified</option><option value="reversed">Reversed</option><option value="rejected">Rejected</option></select></div>
        {acct && <button className="btn primary" onClick={() => setRec(true)}>Record payment</button>}</div>
      <div className="small muted" style={{ margin: '6px 0 10px' }}>Claims count as collections only after verification by a second person. Corrections are made by reversal — payments are never deleted.</div>
      <Err error={error} />
      <Table rows={data} columns={[{ key: 'payment_date', label: 'Date' }, { key: 'registered_name', label: 'Client' }, { label: 'Amount', num: true, render: (r) => pesoStr(r.amount) },
        { label: 'Allocated', num: true, render: (r) => pesoStr(r.allocated) }, { key: 'method', label: 'Method' }, { key: 'reference_no', label: 'Reference' },
        { label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        { label: '', render: (r) => <div className="row">
          {r.status === 'claimed' && checker && <Action className="btn sm" label="Verify" run={() => api.post(`/payments/${r.id}/verify`)} onDone={reload} />}
          {r.status === 'claimed' && checker && <Action className="btn sm" label="Reject" prompt="Reason for rejecting this claim" run={(reason) => api.post(`/payments/${r.id}/reject`, { reason })} onDone={reload} />}
          {r.status === 'verified' && acct && Number(r.allocated) < Number(r.amount) && <button className="btn sm" onClick={() => setAlloc(r)}>Allocate</button>}
          {r.status === 'verified' && hasRole(user, 'approver', 'management') && <Action className="btn sm" label="Reverse" prompt="Reason for reversal (e.g. bounced cheque)" run={(reason) => api.post(`/payments/${r.id}/reverse`, { reason })} onDone={reload} />}
          {r.status === 'verified' && acct && <Action className="btn sm" label="Receipt" prompt="Official receipt number" run={(receiptNumber) => api.post(`/payments/${r.id}/receipts`, { receiptNumber })} onDone={reload} />}
        </div> }]} />
      {rec && <RecordPayment onClose={() => setRec(false)} onDone={reload} />}
      {alloc && <Allocate p={alloc} onClose={() => setAlloc(null)} onDone={reload} />}
    </div>
  );
}

function RecordPayment({ onClose, onDone }) {
  const clients = useLoad('/clients').data;
  const [v, , bind] = useForm({ clientId: '', paymentDate: todayManila(), amount: '', method: '', referenceNo: '', notes: '' });
  return (
    <FormModal title="Record payment (unverified until checked)" onClose={onClose} onDone={onDone} submit={() => api.post('/payments', { ...v, clientId: Number(v.clientId) })}>
      <Field label="Client"><select {...bind('clientId')}><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.registered_name}</option>)}</select></Field>
      <Field label="Payment date"><input type="date" {...bind('paymentDate')} /></Field>
      <Field label="Amount"><input {...bind('amount')} /></Field>
      <Field label="Method"><input {...bind('method')} placeholder="e.g. bank transfer, cheque" /></Field>
      <Field label="Reference number"><input {...bind('referenceNo')} /></Field>
      <Field label="Notes"><input {...bind('notes')} /></Field>
    </FormModal>
  );
}

function Allocate({ p, onClose, onDone }) {
  const invoices = useLoad(`/clients/${p.client_id}`).data?.ledger.invoices.filter((i) => i.outstanding > 0);
  const [v, , bind] = useForm({ invoiceId: '', amount: '' });
  return (
    <FormModal title={`Allocate payment ${p.reference_no || p.id}`} onClose={onClose} onDone={onDone} submit={() => api.post('/allocations', { paymentId: p.id, invoiceId: Number(v.invoiceId), amount: v.amount })}>
      <div className="small muted" style={{ gridColumn: '1/-1' }}>Unallocated: {pesoStr(Number(p.amount) - Number(p.allocated))}. Remaining amounts stay as unapplied credit.</div>
      <Field label="Invoice"><select {...bind('invoiceId')}><option value="">—</option>{invoices?.map((i) => <option key={i.invoiceId} value={i.invoiceId}>{i.invoiceNumber} – outstanding {pesoStr(i.outstanding / 100)}</option>)}</select></Field>
      <Field label="Amount"><input {...bind('amount')} /></Field>
    </FormModal>
  );
}

function Adjustments({ user }) {
  const { data, error, reload } = useLoad('/adjustments');
  const invs = useLoad('/invoices?status=issued').data;
  const [v, setV, bind] = useForm({ invoiceId: '', kind: 'credit_note', amount: '', effectiveDate: todayManila(), reference: '', reason: '' });
  const [err, setErr] = useState(null);
  const mgmt = hasRole(user, 'management');
  return (
    <div className="card">
      <h2>Adjustments &amp; credit notes</h2>
      <div className="small muted" style={{ marginBottom: 10 }}>Requested by accounting; approved by management (not the requester). Approved adjustments can be reversed, never deleted.</div>
      {hasRole(user, 'accounting') && <form className="form" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/adjustments', { ...v, invoiceId: Number(v.invoiceId) }); setV({ ...v, amount: '', reason: '' }); setErr(null); reload(); } catch (x) { setErr(x); } }}>
        <Field label="Invoice"><select {...bind('invoiceId')}><option value="">—</option>{invs?.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} – {i.registered_name}</option>)}</select></Field>
        <Field label="Kind"><select {...bind('kind')}><option value="credit_note">Credit note</option><option value="debit">Debit adjustment</option></select></Field>
        <Field label="Amount"><input {...bind('amount')} /></Field>
        <Field label="Effective date"><input type="date" {...bind('effectiveDate')} /></Field>
        <Field label="Reference"><input {...bind('reference')} /></Field>
        <Field label="Reason"><input {...bind('reason')} /></Field>
        <div style={{ alignSelf: 'end' }}><button className="btn primary">Request</button></div>
      </form>}
      <Err error={err || error} />
      <Table rows={data} columns={[{ key: 'invoice_number', label: 'Invoice' }, { key: 'kind', label: 'Kind' }, { label: 'Amount', num: true, render: (r) => pesoStr(r.amount) },
        { key: 'effective_date', label: 'Effective' }, { key: 'reason', label: 'Reason' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        { label: '', render: (r) => mgmt && <div className="row">
          {r.status === 'pending' && <Action className="btn sm" label="Approve" run={() => api.post(`/adjustments/${r.id}/approve`)} onDone={reload} />}
          {r.status === 'pending' && <Action className="btn sm" label="Reject" prompt="Reason" run={(note) => api.post(`/adjustments/${r.id}/reject`, { note })} onDone={reload} />}
          {r.status === 'approved' && <Action className="btn sm" label="Reverse" prompt="Reason for reversal" run={(reason) => api.post(`/adjustments/${r.id}/reverse`, { reason })} onDone={reload} />}
        </div> }]} />
    </div>
  );
}
