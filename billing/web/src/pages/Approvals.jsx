import React, { useState } from 'react';
import { useLoad, Table, Badge, peso, Err, Action, hasRole, dt } from '../ui.jsx';
import { api } from '../api.js';
import { go } from '../App.jsx';
import { SoaReview } from './Statements.jsx';

const QUEUES = [
  ['pending_approval', 'Pending approval'], ['blocked', 'Blocked'], ['approved,send_failed', 'Approved – awaiting send'],
  ['send_unknown', 'Uncertain sends'], ['returned,on_hold', 'Returned / on hold'], ['sent', 'Sent'], ['rejected,cancelled', 'Rejected / cancelled'],
];

export default function Approvals() {
  const [q, setQ] = useState(QUEUES[0][0]);
  const { data, error } = useLoad(`/drafts?status=${q}`);
  return (
    <div className="card">
      <div className="tabs">{QUEUES.map(([k, l]) => <button key={k} className={q === k ? 'on' : ''} onClick={() => setQ(k)}>{l}</button>)}</div>
      <Err error={error} />
      <Table rows={data} onRow={(r) => go(`approvals/${r.id}`)} columns={[{ key: 'id', label: '#' }, { key: 'jo_number', label: 'Job Order' }, { key: 'registered_name', label: 'Client' },
        { label: 'To', render: (r) => r.to_recipients.join(', ') || <Badge tone="bad">none</Badge> }, { label: 'Outstanding', num: true, render: (r) => peso(r.amounts?.outstanding) },
        { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { label: 'SOA', render: (r) => (r.soa_status ? <Badge>{r.soa_status}</Badge> : <Badge tone="bad">none</Badge>) },
        { key: 'run_key', label: 'Run' }, { label: 'Updated', render: (r) => dt(r.updated_at) },
        { label: 'Blocked because', render: (r) => <span className="small">{r.blocked_reasons.join('; ')}</span> }]} />
    </div>
  );
}

export function DraftDetail({ id, user }) {
  const { data, error, reload } = useLoad(`/drafts/${id}`);
  const [edit, setEdit] = useState(null);
  const [note, setNote] = useState('');
  const [soaReview, setSoaReview] = useState(false);
  if (error) return <Err error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const { draft: d, soa } = data;
  const editable = hasRole(user, 'accounting') && ['blocked', 'pending_approval', 'returned', 'on_hold', 'approved', 'send_failed'].includes(d.status);
  const approver = hasRole(user, 'approver');
  const isAuthor = [d.created_by, d.last_edited_by].includes(user.id);
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><a href="#/approvals">← Approvals</a></div>
      {d.blocked_reasons.length > 0 && <div className="alert bad"><b>Blocked:</b> {d.blocked_reasons.join('; ')}</div>}
      {!data.integrity.ok && <div className="alert bad">Content integrity check failed — the stored hash does not match the current content. Do not send.</div>}
      <div className="grid2">
        <div className="card">
          <div className="spread"><h2>Draft #{d.id} · v{d.version}</h2><Badge>{d.status}</Badge></div>
          <dl className="kv">
            <dt>Job order</dt><dd><a href={`#/job-orders/${d.job_order_id}`}>{d.jo_number}</a>{d.covered_job_order_ids.length > 1 && ` (+${d.covered_job_order_ids.length - 1} sharing invoice)`}</dd>
            <dt>Client</dt><dd>{d.registered_name || '—'}</dd>
            <dt>To</dt><dd>{d.to_recipients.join(', ') || '—'}</dd><dt>Cc</dt><dd>{d.cc_recipients.join(', ') || '—'}</dd>
            <dt>Original amount</dt><dd>{peso(d.amounts.original)}</dd><dt>Payments/credits</dt><dd>{peso(d.amounts.paymentsAndCredits)}</dd>
            <dt>Outstanding</dt><dd><b>{peso(d.amounts.outstanding)}</b></dd><dt>Overdue</dt><dd>{peso(d.amounts.overdue)}</dd>
            <dt>Tone</dt><dd>{d.tone}</dd><dt>Gmail</dt><dd className="small">{d.gmail_message_id ? `sent · message ${d.gmail_message_id}` : d.gmail_draft_id ? `draft ${d.gmail_draft_id}` : 'not yet in Gmail'}</dd>
          </dl>
          <h3>Statement of Account</h3>
          {soa ? <div className="row"><a href={`/api/soa/${soa.id}/pdf`} target="_blank" rel="noreferrer">{soa.statement_number} v{soa.version}</a><Badge>{soa.status}</Badge>{soa.has_discrepancy && <Badge tone="warn">discrepancy</Badge>}
            {soa.status === 'pending_review' && hasRole(user, 'approver', 'accounting') && <button className="btn sm" onClick={() => setSoaReview(true)}>Review SOA</button>}</div> : <div className="alert bad">No statement attached.</div>}
        </div>
        <div className="card">
          <h2>Decision</h2>
          {d.status === 'pending_approval' && approver && (isAuthor ? <div className="alert warn">You created or edited this draft, so you cannot approve it.</div> : <>
            <input placeholder="Note (required to return, reject or hold)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <div className="row">
              <Action className="btn primary" label="Approve this version" disabled={soa?.status !== 'reviewed'} run={() => api.post(`/drafts/${d.id}/decide`, { decision: 'approve', note })} onDone={reload} />
              <Action label="Return for correction" run={() => api.post(`/drafts/${d.id}/decide`, { decision: 'return', note })} onDone={reload} />
              <Action label="Place on hold" run={() => api.post(`/drafts/${d.id}/decide`, { decision: 'hold', note })} onDone={reload} />
              <Action className="btn danger" label="Reject" run={() => api.post(`/drafts/${d.id}/decide`, { decision: 'reject', note })} onDone={reload} />
            </div>
            {soa?.status !== 'reviewed' && <div className="small muted" style={{ marginTop: 6 }}>Review the attached statement before approving.</div>}
          </>)}
          {['approved', 'send_failed'].includes(d.status) && hasRole(user, 'sender') && <>
            <div className="alert info">Sending re-synchronizes the Job Order List first and is blocked if the project is now marked Paid, the balance changed, or the approval no longer matches.</div>
            <Action className="btn primary" label={d.status === 'send_failed' ? 'Retry send' : 'Send approved email'} confirm={`Send to ${d.to_recipients.join(', ')}?`} run={() => api.post(`/drafts/${d.id}/send`)} onDone={reload} />
          </>}
          {d.status === 'send_unknown' && <>
            <div className="alert warn">The outcome of the last send is uncertain. Reconcile before any retry to avoid a duplicate email.</div>
            <div className="row">
              <Action className="btn primary" label="Check Gmail for this send" run={() => api.post(`/drafts/${d.id}/reconcile-send`)} onDone={(r) => { if (r.outcome === 'undetermined') alert(r.message); reload(); }} />
              {approver && <Action label="Confirm: it WAS sent" prompt="Evidence (e.g. found in Sent folder at 10:42)" run={(n) => api.post(`/drafts/${d.id}/manual-resolve`, { wasSent: true, note: n })} onDone={reload} />}
              {approver && <Action label="Confirm: NOT sent" prompt="Evidence" run={(n) => api.post(`/drafts/${d.id}/manual-resolve`, { wasSent: false, note: n })} onDone={reload} />}
            </div>
          </>}
          {editable && <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setEdit({ subject: d.subject, body: d.body_text, to: d.to_recipients.join(', '), cc: d.cc_recipients.join(', ') })}>Edit</button>
            <Action label="Regenerate from current data" run={() => api.post(`/drafts/${d.id}/regenerate`)} onDone={reload} />
            {d.status === 'approved' && <span className="small muted">Editing invalidates the approval.</span>}
          </div>}
          <h3>Approval history</h3>
          <Table rows={data.approvals} columns={[{ key: 'decision', label: 'Decision' }, { key: 'draft_version', label: 'v' }, { key: 'approver', label: 'By' }, { label: 'When', render: (r) => dt(r.decided_at) },
            { key: 'note', label: 'Note' }, { label: 'Validity', render: (r) => (r.invalidated_at ? <span className="small">invalidated: {r.invalidated_reason}</span> : r.expires_at ? `expires ${dt(r.expires_at)}` : '') }]} />
          <h3>Send attempts</h3>
          <Table rows={data.attempts} columns={[{ label: 'When', render: (r) => dt(r.started_at) }, { key: 'attempted_by_email', label: 'By' }, { label: 'Result', render: (r) => <Badge>{r.status}</Badge> }, { key: 'gmail_message_id', label: 'Gmail id' }, { key: 'error', label: 'Error' }]} />
        </div>
      </div>
      <div className="card">
        {edit ? <>
          <h2>Edit draft</h2>
          <div className="form"><label className="f">To (approved addresses only)<input value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /></label>
            <label className="f">Cc<input value={edit.cc} onChange={(e) => setEdit({ ...edit, cc: e.target.value })} /></label></div>
          <label className="f" style={{ marginTop: 8 }}>Subject<input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
          <label className="f" style={{ marginTop: 8 }}>Body<textarea style={{ minHeight: 320 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 8 }}>
            <Action className="btn primary" label="Save new version" run={() => api.put(`/drafts/${d.id}`, { subject: edit.subject, body: edit.body, to: edit.to.split(/[,;\s]+/).filter(Boolean), cc: edit.cc.split(/[,;\s]+/).filter(Boolean) })} onDone={() => { setEdit(null); reload(); }} />
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
        </> : <><h2>Subject: {d.subject}</h2><pre className="mail">{d.body_text}</pre></>}
      </div>
      <div className="grid2">
        <div className="card"><h2>Versions</h2>
          <Table rows={data.versions} columns={[{ key: 'version', label: 'v' }, { key: 'edited_by_email', label: 'By', render: (r) => r.edited_by_email || 'system' }, { label: 'When', render: (r) => dt(r.edited_at) }, { label: 'Hash', render: (r) => <span className="mono">{r.content_hash.slice(0, 12)}</span> }]} />
        </div>
        <div className="card"><h2>Account history (this job order)</h2>
          <Table rows={data.accountHistory} onRow={(r) => go(`approvals/${r.id}`)} columns={[{ key: 'id', label: '#' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { label: 'Sent', render: (r) => dt(r.sent_at) }, { key: 'subject', label: 'Subject' }]} />
        </div>
      </div>
      {soaReview && <SoaReview id={soa.id} onClose={() => setSoaReview(false)} onDone={reload} />}
    </>
  );
}
