import React, { useState } from 'react';
import { useLoad, Table, Badge, Err, Action, hasRole, dt, peso } from '../ui.jsx';
import { api } from '../api.js';

export default function Runs({ user }) {
  const { data, error, reload } = useLoad('/collection-runs');
  const [sel, setSel] = useState(null);
  const detail = useLoad(sel ? `/collection-runs/${sel}` : null);
  return (
    <>
      <div className="card">
        <div className="spread"><div><h2 style={{ margin: 0 }}>Monday collection runs</h2>
          <div className="small muted">Schedule: <span className="mono">{data?.cron}</span> ({data?.timezone}) — next run {dt(data?.nextRun)}. Each run drafts one email per unpaid billed project; nothing is sent automatically.</div></div>
          {hasRole(user, 'accounting', 'sysadmin') && <Action className="btn primary" label="Run / resume this week's run now" confirm="Synchronize the Job Order List and prepare this week's collection drafts?" run={() => api.post('/collection-runs')} onDone={reload} />}
        </div>
        <Err error={error} />
        <Table rows={data?.runs} onRow={(r) => setSel(r.run_key)} columns={[{ key: 'run_key', label: 'Week (Monday)' }, { key: 'trigger', label: 'Trigger' }, { label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'attempts', label: 'Attempts', num: true }, { label: 'Started', render: (r) => dt(r.started_at) }, { label: 'Finished', render: (r) => dt(r.finished_at) },
          { label: 'Drafts', num: true, render: (r) => (r.stats ? (r.stats.draft_created || 0) + (r.stats.draft_blocked || 0) : '—') }, { key: 'error', label: 'Error' }]} />
      </div>
      {sel && detail.data && <div className="card">
        <h2>{detail.data.title}</h2>
        <div className="row" style={{ marginBottom: 10 }}>{Object.entries(detail.data.summary).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => <span key={k} className="badge">{k}: {String(v)}</span>)}</div>
        <Table rows={detail.data.sections[0]?.rows} columns={[{ key: 'jo_number', label: 'Job Order' }, { key: 'client_name_source', label: 'Client' }, { label: 'Outcome', render: (r) => <Badge>{r.outcome}</Badge> },
          { label: 'Draft', render: (r) => (r.draft_id ? <a href={`#/approvals/${r.draft_id}`}>#{r.draft_id}</a> : '') }, { label: 'Draft status', render: (r) => (r.draft_status ? <Badge>{r.draft_status}</Badge> : '') },
          { label: 'Outstanding', num: true, render: (r) => peso(r.outstanding) }, { key: 'detail', label: 'Detail' }]} />
      </div>}
    </>
  );
}
