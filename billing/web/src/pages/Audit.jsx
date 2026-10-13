import React, { useState } from 'react';
import { useLoad, Table, Err, dt } from '../ui.jsx';

export default function Audit() {
  const [f, setF] = useState({ q: '', action: '', entityType: '', from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error } = useLoad(`/audit?${qs}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Search user, record, reason…" value={f.q} onChange={set('q')} />
        <input placeholder="Action prefix (e.g. payment.)" value={f.action} onChange={set('action')} />
        <select value={f.entityType} onChange={set('entityType')}><option value="">All records</option>{['job_order', 'invoice', 'payment', 'payment_allocation', 'adjustment', 'soa', 'email_draft', 'approval', 'collection_run', 'sync_run', 'sheet_writeback', 'client', 'user', 'setting', 'exception', 'integration'].map((x) => <option key={x}>{x}</option>)}</select>
        <input type="date" value={f.from} onChange={set('from')} /><input type="date" value={f.to} onChange={set('to')} />
      </div>
      <div className="small muted" style={{ marginBottom: 8 }}>The audit log is append-only; the database rejects edits and deletions.</div>
      <Err error={error} />
      <Table rows={data} columns={[{ label: 'When', render: (r) => dt(r.at) }, { key: 'actor_label', label: 'Actor' }, { key: 'action', label: 'Action' }, { label: 'Record', render: (r) => `${r.entity_type} ${r.entity_id ?? ''}` },
        { label: 'Before', render: (r) => <span className="mono">{r.before ? JSON.stringify(r.before).slice(0, 200) : ''}</span> },
        { label: 'After', render: (r) => <span className="mono">{r.after ? JSON.stringify(r.after).slice(0, 200) : ''}</span> }, { key: 'reason', label: 'Reason' },
        { label: 'Related', render: (r) => <span className="mono">{r.related ? JSON.stringify(r.related) : ''}</span> }]} />
    </div>
  );
}
