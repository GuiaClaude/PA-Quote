import React, { useState } from 'react';
import { useLoad, Table, Badge, peso, Err, Action, hasRole, dt, Modal } from '../ui.jsx';
import { api } from '../api.js';

export function SoaReview({ id, onClose, onDone }) {
  const { data, error } = useLoad(`/soa/${id}`);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Modal title="Review Statement of Account" onClose={onClose}>
      <Err error={error} />
      {data && <>
        <div className="spread"><b>{data.statement_number} v{data.version}</b><a className="btn sm" href={`/api/soa/${id}/pdf`} target="_blank" rel="noreferrer">Open PDF</a></div>
        <div className="small muted">{data.registered_name} · {data.statement_date} · {data.mode} · {data.basis}</div>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Total outstanding</dt><dd><b>{peso(data.totals.outstanding)}</b></dd><dt>Overdue</dt><dd>{peso(data.totals.overdue)}</dd>
          <dt>Unapplied credits</dt><dd>{peso(data.totals.unapplied)}</dd><dt>Unverified claims</dt><dd>{peso(data.totals.unverifiedClaims)} (excluded)</dd>
          <dt>Lines</dt><dd>{data.lines.length}</dd>
        </dl>
        <h3>Internal reconciliation report</h3>
        {data.recon_report.discrepancies.length === 0 ? <div className="alert ok">Job Order List and ledger agree for this client.</div>
          : <div className="alert warn"><b>Discrepancies</b><ul>{data.recon_report.discrepancies.map((d, i) => <li key={i}>{d.kind.replace(/_/g, ' ')} – JO {d.jo} {d.invoices?.join(', ') || d.invoice || ''} {d.amount ? peso(d.amount) : ''}</li>)}</ul></div>}
        <Table rows={data.recon_report.jobOrders} columns={[{ key: 'jo', label: 'JO' }, { key: 'sourcePaymentStatus', label: 'Sheet status' }, { key: 'sheetBillingAmount', label: 'Sheet amount', money: true, num: true },
          { label: 'Ledger invoices', render: (r) => r.ledgerInvoices.join(', ') }, { key: 'ledgerOutstanding', label: 'Ledger outstanding', money: true, num: true }]} />
        {data.status === 'pending_review' && <div style={{ marginTop: 12 }}>
          {data.has_discrepancy && <label className="row small"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have reviewed the discrepancies; they are disclosed on the statement.</label>}
          <input placeholder="Review note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', margin: '8px 0' }} />
          <div className="row">
            <Action className="btn primary" label="Mark reviewed & store in Drive" run={() => api.post(`/soa/${id}/review`, { approve: true, acknowledgeDiscrepancy: ack, note })} onDone={() => { onDone?.(); onClose(); }} />
            <Action className="btn danger" label="Reject" run={() => api.post(`/soa/${id}/review`, { approve: false, note })} onDone={() => { onDone?.(); onClose(); }} />
          </div>
        </div>}
      </>}
    </Modal>
  );
}

export default function Statements({ user }) {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(`/soa${status ? `?status=${status}` : ''}`);
  const [review, setReview] = useState(null);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Statements of Account</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="pending_review">Awaiting review</option><option value="reviewed">Reviewed</option><option value="superseded">Superseded</option><option value="rejected">Rejected</option></select>
        <span className="small muted">Generate statements from a client's page. Only reviewed statements can be attached to collection emails.</span></div>
      <Err error={error} />
      <Table rows={data} columns={[{ label: 'Statement', render: (r) => <a href={`/api/soa/${r.id}/pdf`} target="_blank" rel="noreferrer">{r.statement_number} v{r.version}</a> },
        { key: 'registered_name', label: 'Client' }, { key: 'statement_date', label: 'As of' }, { key: 'mode', label: 'Mode' },
        { label: 'Outstanding', num: true, render: (r) => peso(r.totals?.outstanding) }, { label: 'Overdue', num: true, render: (r) => peso(r.totals?.overdue) },
        { label: 'Status', render: (r) => <><Badge>{r.status}</Badge> {r.has_discrepancy && <Badge tone="warn">discrepancy</Badge>}</> },
        { label: 'Generated', render: (r) => <>{dt(r.generated_at)}<div className="small muted">{r.generated_by_email || 'system'}</div></> },
        { label: 'Drive', render: (r) => (r.drive_web_link ? <a href={r.drive_web_link} target="_blank" rel="noreferrer">open</a> : r.drive_error ? <Badge tone="bad">{r.drive_error.slice(0, 40)}</Badge> : '—') },
        { label: '', render: (r) => r.status === 'pending_review' && hasRole(user, 'approver', 'accounting') && <button className="btn sm" onClick={() => setReview(r.id)}>Review</button> }]} />
      {review && <SoaReview id={review} onClose={() => setReview(null)} onDone={reload} />}
    </div>
  );
}
