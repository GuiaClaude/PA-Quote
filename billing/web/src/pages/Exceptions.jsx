import React, { useState } from 'react';
import { useLoad, Table, Badge, Err, Action, hasRole, dt } from '../ui.jsx';
import { api } from '../api.js';

export default function Exceptions({ user }) {
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useLoad(`/exceptions?status=${status}`);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Reconciliation exceptions</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option></select>
        <span className="small muted">Conflicts are flagged here; neither the sheet nor the ledger is altered automatically.</span></div>
      <Err error={error} />
      <Table rows={data} columns={[{ label: 'Severity', render: (r) => <Badge>{r.severity}</Badge> }, { label: 'Kind', render: (r) => r.kind.replace(/_/g, ' ') },
        { label: 'Job order', render: (r) => (r.job_order_id ? <a href={`#/job-orders/${r.job_order_id}`}>{r.jo_number}</a> : '') }, { key: 'registered_name', label: 'Client' },
        { key: 'message', label: 'Detail' }, { label: 'Since', render: (r) => dt(r.created_at) }, { label: 'Last seen', render: (r) => dt(r.last_seen_at) },
        { label: '', render: (r) => (r.status === 'open' ? hasRole(user, 'accounting', 'approver', 'management') && <Action className="btn sm" label="Resolve" prompt="How was this resolved?" run={(resolution) => api.post(`/exceptions/${r.id}/resolve`, { resolution })} onDone={reload} /> : <span className="small">{r.resolution}</span>) }]} />
    </div>
  );
}
