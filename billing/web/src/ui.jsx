import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

export const peso = (c) => (c === null || c === undefined || c === '' ? '—' : `₱${(Number(c) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const pesoStr = (s) => (s === null || s === undefined ? '—' : peso(Math.round(Number(s) * 100)));
export const dt = (s) => (s ? new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export function useLoad(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api.get(path).then((d) => { setData(d); setError(null); }).catch(setError).finally(() => setLoading(false));
  }, [path]);
  useEffect(reload, [reload, ...deps]);
  return { data, error, loading, reload };
}

const STATUS_TONE = {
  ok: ['sent', 'reviewed', 'verified', 'issued', 'succeeded', 'applied', 'Paid', 'resolved', 'approved', 'active', 'reconciled_sent'],
  warn: ['pending_approval', 'pending_review', 'claimed', 'unreconciled', 'running', 'proposed', 'on_hold', 'returned', 'partial', 'Partially Paid', 'pending', 'send_failed', 'warning', 'in_progress'],
  bad: ['blocked', 'failed', 'rejected', 'conflict', 'send_unknown', 'critical', 'reversed', 'void', 'unknown', 'Disputed'],
  muted: ['cancelled', 'superseded', 'excluded_paid', 'resolved'],
};
export function Badge({ children, tone }) {
  const t = tone || Object.entries(STATUS_TONE).find(([, list]) => list.includes(children))?.[0] || '';
  return <span className={`badge ${t}`}>{String(children ?? '').replace(/_/g, ' ')}</span>;
}

export function Err({ error }) {
  if (!error) return null;
  return <div className="alert bad">{error.message || String(error)}{error.details?.discrepancies && <ul>{error.details.discrepancies.map((d, i) => <li key={i}>{d.kind}: {d.jo} {d.invoices?.join(', ')}</li>)}</ul>}</div>;
}

export function Kpi({ label, value, sub }) {
  return <div className="kpi"><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</div>;
}

export function SyncBanner({ sync }) {
  if (!sync) return null;
  if (sync.stale) return <div className="alert bad"><b>Payment status may not be current.</b> {sync.staleReason}. Last successful sync: {dt(sync.lastSuccess?.finished_at)}. Figures below reflect the last successful synchronization only.</div>;
  return <div className="small muted" style={{ marginBottom: 10 }}>Job Order List last synchronized {dt(sync.lastSuccess?.finished_at)}</div>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="spread" style={{ marginBottom: 10 }}><b>{title}</b><button className="btn sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

/** Button that runs an async action, shows errors, and refreshes. */
export function Action({ label, run, onDone, className = 'btn', confirm, disabled, prompt }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    let input;
    if (prompt) { input = window.prompt(prompt); if (input === null) return; }
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setErr(null);
    try { const r = await run(input); onDone?.(r); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return <span><button className={className} disabled={busy || disabled} onClick={go}>{busy ? '…' : label}</button>{err && <span className="badge bad" style={{ marginLeft: 6 }} title={err.message}>{err.message.slice(0, 140)}</span>}</span>;
}

export function Table({ columns, rows, onRow, empty = 'No records.' }) {
  if (!rows?.length) return <div className="muted small">{empty}</div>;
  return (
    <div className="scroll"><table>
      <thead><tr>{columns.map((c) => <th key={c.key || c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
          {columns.map((c) => <td key={c.key || c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : c.money ? peso(r[c.key]) : (r[c.key] ?? '—')}</td>)}
        </tr>))}
      </tbody>
    </table></div>
  );
}

export function Field({ label, children }) { return <label className="f">{label}{children}</label>; }

export function useForm(init) {
  const [v, setV] = useState(init);
  const bind = (k, type) => ({ value: v[k] ?? '', onChange: (e) => setV({ ...v, [k]: type === 'checkbox' ? e.target.checked : e.target.value }) });
  return [v, setV, bind];
}

export const hasRole = (user, ...roles) => roles.some((r) => user?.roles?.includes(r));
