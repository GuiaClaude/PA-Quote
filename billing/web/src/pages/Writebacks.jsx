import React from 'react';
import { useLoad, Table, Badge, Err, Action, hasRole, dt } from '../ui.jsx';
import { api } from '../api.js';

export default function Writebacks({ user }) {
  const { data, error, reload } = useLoad('/writebacks');
  const can = hasRole(user, 'approver', 'management');
  return (
    <div className="card">
      <h2>Sheet update reconciliation</h2>
      <div className="small muted" style={{ marginBottom: 10 }}>Proposed changes to the Job Order List. On approval the row is located by Job Order Number, the live cell is re-read, and the single cell is written only if it still shows the original value and holds no formula.</div>
      <Err error={error} />
      <Table rows={data} columns={[{ label: 'Job order', render: (r) => <a href={`#/job-orders/${r.job_order_id}`}>{r.jo_number}</a> }, { key: 'field', label: 'Field' },
        { label: 'Sheet value (original)', render: (r) => r.expected_value || <span className="muted">blank</span> }, { label: 'Proposed', render: (r) => <b>{r.new_value}</b> },
        { key: 'reason', label: 'Reason' }, { key: 'requested_by_email', label: 'Requested by' }, { label: 'When', render: (r) => dt(r.requested_at) },
        { label: 'Status', render: (r) => <><Badge>{r.status}</Badge>{r.error && <div className="small">{r.error}</div>}{r.applied_range && <div className="small mono">{r.applied_range}</div>}</> },
        { label: '', render: (r) => r.status === 'proposed' && can && r.requested_by !== user.id && <div className="row">
          <Action className="btn sm primary" label="Apply to sheet" run={() => api.post(`/writebacks/${r.id}/apply`)} onDone={reload} />
          <Action className="btn sm" label="Reject" prompt="Reason" run={(reason) => api.post(`/writebacks/${r.id}/reject`, { reason })} onDone={reload} /></div> }]} />
    </div>
  );
}
