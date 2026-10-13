import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Err } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import JobOrders, { JobOrderDetail } from './pages/JobOrders.jsx';
import Clients, { ClientDetail } from './pages/Clients.jsx';
import Ledger from './pages/Ledger.jsx';
import Statements from './pages/Statements.jsx';
import Approvals, { DraftDetail } from './pages/Approvals.jsx';
import Runs from './pages/Runs.jsx';
import Exceptions from './pages/Exceptions.jsx';
import Writebacks from './pages/Writebacks.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  ['Overview', [['dashboard', 'Dashboard'], ['job-orders', 'Job Orders'], ['unbilled', 'Unbilled Control']]],
  ['Receivables', [['clients', 'Clients'], ['ledger', 'Invoices & Payments'], ['statements', 'Statements of Account']]],
  ['Collections', [['approvals', 'Email Approvals'], ['runs', 'Monday Runs'], ['exceptions', 'Exceptions'], ['writebacks', 'Sheet Updates']]],
  ['Control', [['reports', 'Reports'], ['audit', 'Audit Trail'], ['settings', 'Settings']]],
];

function useHash() {
  const [h, setH] = useState(window.location.hash.slice(2) || 'dashboard');
  useEffect(() => { const f = () => setH(window.location.hash.slice(2) || 'dashboard'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
export const go = (p) => { window.location.hash = `/${p}`; };

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api.post('/auth/login', { email, password }); onLogin(r.user); } catch (x) { setErr(x); }
  };
  return (
    <div className="login card">
      <h2><span style={{ color: '#3bbfc8', fontWeight: 300 }}>Print</span><span style={{ color: '#e0295a' }}>Amplified</span> Billing &amp; Collections</h2>
      <Err error={err} />
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button className="btn primary">Sign in</button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [sample, setSample] = useState(false);
  const [open, setOpen] = useState(false);
  const route = useHash();
  useEffect(() => { api.get('/auth/me').then((r) => { setUser(r.user); setSample(r.sampleMode); }).catch(() => setUser(null)); }, []);
  useEffect(() => setOpen(false), [route]);
  if (user === undefined) return null;
  if (!user) return <Login onLogin={setUser} />;
  const [page, id] = route.split('?')[0].split('/');
  const props = { user, id };
  const pages = {
    dashboard: Dashboard, 'job-orders': id ? JobOrderDetail : JobOrders, unbilled: (p) => <Reports {...p} initial="unbilled" />,
    clients: id ? ClientDetail : Clients, ledger: Ledger, statements: Statements, approvals: id ? DraftDetail : Approvals,
    runs: Runs, exceptions: Exceptions, writebacks: Writebacks, reports: Reports, audit: Audit, settings: Settings,
  };
  const Page = pages[page] || Dashboard;
  const title = NAV.flatMap(([, items]) => items).find(([k]) => k === page)?.[1] || 'Dashboard';
  return (
    <div className="layout">
      <nav className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><span>Print</span><b>Amplified</b><div className="small" style={{ color: '#66728a' }}>Billing &amp; Collections</div></div>
        {NAV.map(([g, items]) => (
          <div key={g}><div className="group">{g}</div>
            {items.map(([k, label]) => <a key={k} href={`#/${k}`} className={page === k ? 'active' : ''}>{label}</a>)}
          </div>
        ))}
      </nav>
      <main className="main">
        <div className="top">
          <div className="row"><button className="btn menu-btn" onClick={() => setOpen(!open)}>☰</button><h1>{title}</h1></div>
          <div className="row user">{user.name} · {user.roles.join(', ') || 'no roles'}
            <button className="btn sm" onClick={async () => { await api.post('/auth/logout'); setUser(null); }}>Sign out</button></div>
        </div>
        {sample && <div className="alert warn"><b>SAMPLE DATA MODE.</b> This environment shows labelled sample records for demonstration only — not live company data.</div>}
        <Page {...props} />
      </main>
    </div>
  );
}
