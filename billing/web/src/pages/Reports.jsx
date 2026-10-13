import React, { useState } from 'react';
import { useLoad, Table, Err, todayManila } from '../ui.jsx';

const KINDS = [['daily', 'Daily'], ['unbilled', 'Unbilled control'], ['monday', 'Monday run'], ['weekly', 'Weekly management'], ['monthly', 'Monthly']];
const isMoney = (k) => /receiv|billing|collect|value|overdue|outstanding|credit|debit|adjust|closing|opening|longOverdue/i.test(k) && !/Reconciles|Pct|Count|accounts|without/i.test(k);

export default function Reports({ initial }) {
  const [kind, setKind] = useState(initial || 'daily');
  const [date, setDate] = useState(todayManila());
  const [month, setMonth] = useState(todayManila().slice(0, 7));
  const qs = kind === 'monthly' ? `month=${month}` : kind === 'monday' ? '' : `date=${date}`;
  const { data, error } = useLoad(`/reports/${kind}?${qs}`);
  const href = (f) => `/api/reports/${kind}?${qs}&format=${f}`;
  return (
    <>
      <div className="tabs">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="card">
        <div className="spread">
          <div className="row">{kind === 'monthly' ? <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /> : kind !== 'monday' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
            <b>{data?.title}</b><span className="small muted">as of {data?.asOf}</span></div>
          <div className="row"><a className="btn sm" href={href('pdf')}>PDF</a><a className="btn sm" href={href('xlsx')}>Excel</a><a className="btn sm" href={href('csv')}>CSV</a></div>
        </div>
        <Err error={error} />
        {data?.checks?.length > 0 && <div className="alert bad" style={{ marginTop: 10 }}>Reconciliation check failed: {data.checks.map((c) => `${c.check} (unexplained ${(c.unexplainedCentavos / 100).toFixed(2)})`).join('; ')}</div>}
        {data?.summary && <div className="grid" style={{ marginTop: 12 }}>{Object.entries(data.summary).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => (
          <div className="kpi" key={k}><div className="l">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</div><div className="v" style={{ fontSize: 16 }}>{typeof v === 'number' && isMoney(k) ? `₱${(v / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : String(v)}</div></div>))}</div>}
      </div>
      {data?.sections?.map((s) => <div className="card" key={s.title}><h2>{s.title} <span className="muted small">({s.rows.length})</span></h2>
        <Table rows={s.rows} columns={s.columns.map((c) => ({ ...c, num: c.money, render: c.money ? undefined : (r) => (r[c.key] === null || r[c.key] === undefined ? '—' : typeof r[c.key] === 'object' ? JSON.stringify(r[c.key]) : String(r[c.key])) }))} /></div>)}
    </>
  );
}
