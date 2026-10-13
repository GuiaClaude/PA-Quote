import React, { useEffect, useState } from 'react';
import { useLoad, Table, Badge, Err, Action, hasRole, dt, Field } from '../ui.jsx';
import { api } from '../api.js';

export default function Settings({ user }) {
  const [tab, setTab] = useState('connections');
  const tabs = [['connections', 'Connections'], ['mapping', 'Spreadsheet & column mapping'], ['company', 'Company & payment instructions'], ['policy', 'Policies & schedule'], ['users', 'Users & roles']];
  return (
    <>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'connections' && <Connections user={user} />}
      {tab === 'mapping' && <Mapping user={user} />}
      {tab === 'company' && <Company user={user} />}
      {tab === 'policy' && <Policy user={user} />}
      {tab === 'users' && <Users user={user} />}
    </>
  );
}

const Ok = ({ ok, children }) => <Badge tone={ok ? 'ok' : 'bad'}>{children || (ok ? 'operational' : 'not configured')}</Badge>;

function Connections({ user }) {
  const { data, error, reload } = useLoad('/integrations');
  const [test, setTest] = useState(null);
  const admin = hasRole(user, 'sysadmin');
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (error) return <Err error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  return (
    <>
      {q.get('connected') && <div className="alert ok">Google account connected.</div>}
      {q.get('oauth_error') && <div className="alert bad">Google authorization was not completed: {q.get('oauth_error')}</div>}
      <div className="card">
        <div className="spread"><h2>Google Workspace</h2>
          {admin && <div className="row">
            <a className={`btn ${data.oauthConfigured && data.encryptionConfigured ? 'primary' : ''}`} href="/api/google/oauth/start" aria-disabled={!data.oauthConfigured}>{data.connected ? 'Reconnect' : 'Connect Google account'}</a>
            <Action label="Test connections" run={() => api.post('/integrations/test')} onDone={setTest} />
            {data.connected && <Action className="btn danger" label="Disconnect" confirm="Disconnect Google? Sync, Drive storage and sending will stop." run={() => api.post('/google/disconnect')} onDone={reload} />}
          </div>}</div>
        {!data.oauthConfigured && <div className="alert warn">GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server. See docs/DEPLOYMENT.md.</div>}
        {!data.encryptionConfigured && <div className="alert warn">APP_ENCRYPTION_KEY is not set; credentials cannot be stored.</div>}
        <dl className="kv">
          <dt>Connected account</dt><dd>{data.account || '—'} {data.connectedAt && <span className="small muted">since {dt(data.connectedAt)}</span>}</dd>
          <dt>Granted scopes</dt><dd className="small mono">{data.scopes.join(' ') || '—'}</dd>
          <dt>Google Sheets</dt><dd><Ok ok={data.sheets.authorized && data.sheets.spreadsheetId && data.sheets.mappedFields > 0} /> {data.sheets.spreadsheetId ? <span className="mono small">{data.sheets.spreadsheetId} · tab "{data.sheets.tabName}" · {data.sheets.mappedFields} fields mapped</span> : 'spreadsheet not selected'}</dd>
          <dt>SOA storage folder (Drive)</dt><dd><Ok ok={data.drive.authorized && data.drive.soaFolderId} /> <span className="mono small">{data.drive.soaFolderId || 'not set'}</span>
            {admin && data.drive.authorized && !data.drive.soaFolderId && <Action className="btn sm" label="Create folder" run={() => api.post('/integrations/soa-folder', {})} onDone={reload} />}</dd>
          <dt>Gmail sending account</dt><dd><Ok ok={data.gmail.authorized} /> {data.gmail.sendingAccount || '—'}</dd>
          <dt>Last successful sync</dt><dd>{dt(data.sync.lastSuccess?.finished_at)} {data.sync.stale && <Badge tone="bad">stale</Badge>}</dd>
          <dt>Last sync attempt</dt><dd>{data.sync.lastRun ? <><Badge>{data.sync.lastRun.status}</Badge> {dt(data.sync.lastRun.started_at)} {data.sync.lastRun.error}</> : '—'}</dd>
          <dt>Last collection run</dt><dd>{data.lastCollectionRun ? <><Badge>{data.lastCollectionRun.status}</Badge> {data.lastCollectionRun.run_key} · {dt(data.lastCollectionRun.started_at)}</> : 'never'}</dd>
          <dt>Next collection run</dt><dd>{dt(data.nextCollectionRun)} (Monday 08:00 Asia/Manila)</dd>
        </dl>
        {test && <div style={{ marginTop: 12 }}>{Object.entries(test).map(([k, v]) => <div key={k} className={`alert ${v.ok ? 'ok' : 'bad'}`}><b>{k}</b>: {v.ok ? JSON.stringify(v.detail) : v.error}</div>)}</div>}
      </div>
      <div className="card"><h2>Recent integration errors</h2>
        <Table rows={data.errors} columns={[{ label: 'When', render: (r) => dt(r.at) }, { key: 'integration', label: 'Integration' }, { key: 'message', label: 'Message' }]} empty="No integration errors recorded." />
      </div>
    </>
  );
}

function Mapping({ user }) {
  const { data, reload } = useLoad('/settings');
  const [cfg, setCfg] = useState(null);
  const [disc, setDisc] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setCfg(data.settings.sheet); }, [data]);
  if (!cfg) return <div className="muted">Loading…</div>;
  const admin = hasRole(user, 'sysadmin');
  const headerRow = disc?.preview?.rows?.[cfg.headerRow - 1] || [];
  const set = (k, v) => { setCfg({ ...cfg, [k]: v }); setSaved(false); };
  const list = (k) => ({ value: (cfg[k] || []).join(', '), onChange: (e) => set(k, e.target.value.split(',').map((s) => s.trim()).filter(Boolean)), disabled: !admin });
  const discover = async () => { setErr(null); try { setDisc(await api.post('/integrations/discover', { spreadsheetId: cfg.spreadsheetId, tabName: cfg.tabName })); } catch (e) { setErr(e); } };
  return (
    <>
      <div className="card">
        <h2>1. Source spreadsheet</h2>
        <div className="form">
          <Field label="Spreadsheet ID (from the sheet URL)"><input value={cfg.spreadsheetId} onChange={(e) => set('spreadsheetId', e.target.value.trim())} disabled={!admin} /></Field>
          <Field label="Authoritative tab"><select value={cfg.tabName} onChange={(e) => set('tabName', e.target.value)} disabled={!admin}>
            <option value="">{disc ? 'Select…' : cfg.tabName || 'Inspect first'}</option>{(disc?.tabs || []).map((t) => <option key={t.title}>{t.title}</option>)}{cfg.tabName && !disc && <option>{cfg.tabName}</option>}</select></Field>
          <Field label="Header row number"><input type="number" min="1" value={cfg.headerRow} onChange={(e) => set('headerRow', Number(e.target.value))} disabled={!admin} /></Field>
          <Field label="Text date format in sheet"><select value={cfg.dateOrder} onChange={(e) => set('dateOrder', e.target.value)} disabled={!admin}><option value="MDY">MM/DD/YYYY</option><option value="DMY">DD/MM/YYYY</option></select></Field>
          <div style={{ alignSelf: 'end' }}><button className="btn" onClick={discover} disabled={!cfg.spreadsheetId}>Inspect spreadsheet</button></div>
        </div>
        <Err error={err} />
        {disc && <div style={{ marginTop: 12 }}>
          <div className="small"><b>{disc.title}</b> · timezone {disc.timeZone} · locale {disc.locale}</div>
          <Table rows={disc.tabs} columns={[{ key: 'title', label: 'Tab' }, { key: 'rowCount', label: 'Rows', num: true }, { key: 'columnCount', label: 'Cols', num: true }, { key: 'protectedRanges', label: 'Protected ranges', num: true }, { label: 'Filter', render: (r) => (r.hasFilter ? 'yes' : '') }]} />
          {disc.preview && <><h3>Preview of "{cfg.tabName}" ({disc.preview.totalRows} rows)</h3><div className="scroll"><table><tbody>{disc.preview.rows.map((r, i) => <tr key={i} style={i === cfg.headerRow - 1 ? { fontWeight: 700 } : {}}><td className="muted">{i + 1}</td>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody></table></div></>}
        </div>}
      </div>
      <div className="card">
        <h2>2. Column mapping</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>Map each internal field to the exact header text in the sheet. Nothing is assumed: unmapped optional fields are ignored; unmapped required fields stop synchronization.</div>
        <Table rows={Object.entries(data.fields).map(([k, f]) => ({ k, ...f }))} columns={[
          { label: 'Internal field', render: (r) => <>{r.label} {r.required && <Badge tone="warn">required</Badge>}</> },
          { label: 'Sheet header', render: (r) => (headerRow.length ? (
            <select value={cfg.mapping[r.k] || ''} disabled={!admin} onChange={(e) => set('mapping', { ...cfg.mapping, [r.k]: e.target.value || undefined })}>
              <option value="">— not mapped —</option>{headerRow.filter(Boolean).map((h) => <option key={h}>{h}</option>)}</select>
          ) : <input value={cfg.mapping[r.k] || ''} disabled={!admin} placeholder="Inspect to choose" onChange={(e) => set('mapping', { ...cfg.mapping, [r.k]: e.target.value || undefined })} />) },
          { label: 'Write-back enabled', render: (r) => data.writableCandidates.includes(r.k) && <input type="checkbox" disabled={!admin} checked={cfg.writableFields.includes(r.k)}
            onChange={(e) => set('writableFields', e.target.checked ? [...cfg.writableFields, r.k] : cfg.writableFields.filter((x) => x !== r.k))} /> },
        ]} />
      </div>
      <div className="card">
        <h2>3. Status conventions (exact values used in the sheet)</h2>
        <div className="form">
          <Field label="Payment status values meaning PAID"><input {...list('paidValues')} /></Field>
          <Field label="…meaning partially paid"><input {...list('partiallyPaidValues')} /></Field>
          <Field label="Delivery status values meaning delivered"><input {...list('deliveredValues')} /></Field>
          <Field label="Production values meaning completed"><input {...list('completedValues')} /></Field>
          <Field label="Values meaning cancelled"><input {...list('cancelledValues')} /></Field>
          <Field label="Values meaning on hold"><input {...list('onHoldValues')} /></Field>
          <Field label="Values meaning disputed"><input {...list('disputedValues')} /></Field>
        </div>
        {admin && <div className="row" style={{ marginTop: 12 }}>
          <Action className="btn primary" label="Save spreadsheet settings" run={() => api.put('/settings/sheet', { value: cfg, reason: 'Column mapping updated' })} onDone={() => { setSaved(true); reload(); }} />
          <Action label="Save & sync now" run={async () => { await api.put('/settings/sheet', { value: cfg, reason: 'Column mapping updated' }); return api.post('/sync'); }} onDone={(r) => alert(r.status === 'succeeded' ? `Sync OK: ${r.inserted} new, ${r.updated} updated, ${r.flagged} flagged` : `Sync failed: ${r.error}`)} />
          {saved && <Badge tone="ok">saved</Badge>}</div>}
      </div>
    </>
  );
}

function Company({ user }) {
  const { data, reload } = useLoad('/settings');
  const [c, setC] = useState(null);
  const [pi, setPi] = useState('');
  useEffect(() => { if (data) { setC(data.settings.company); setPi(data.settings.paymentInstructions || ''); } }, [data]);
  if (!c) return <div className="muted">Loading…</div>;
  const admin = hasRole(user, 'sysadmin');
  return (
    <div className="card">
      <h2>Company details on statements</h2>
      <div className="form">
        {['name', 'address', 'phone', 'email', 'tin'].map((k) => <Field key={k} label={k.toUpperCase()}><input value={c[k] || ''} disabled={!admin} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>)}
      </div>
      <h3>Approved payment instructions</h3>
      <div className="small muted">Printed on every SOA and email. Leave blank until approved bank/payment details are confirmed — drafts are blocked while blank.</div>
      <textarea value={pi} disabled={!admin} onChange={(e) => setPi(e.target.value)} />
      {admin && <div className="row" style={{ marginTop: 10 }}>
        <Action className="btn primary" label="Save" run={async () => { await api.put('/settings/company', { value: c }); await api.put('/settings/paymentInstructions', { value: pi, reason: 'Payment instructions updated' }); }} onDone={reload} /></div>}
    </div>
  );
}

function Policy({ user }) {
  const { data, reload } = useLoad('/settings');
  const [p, setP] = useState(null);
  useEffect(() => { if (data) setP(data.settings.policy); }, [data]);
  if (!p) return <div className="muted">Loading…</div>;
  const admin = hasRole(user, 'sysadmin');
  return (
    <div className="card">
      <h2>Policies</h2>
      <div className="form">
        <Field label="Approval expires after (hours)"><input type="number" value={p.approvalExpiryHours} disabled={!admin} onChange={(e) => setP({ ...p, approvalExpiryHours: Number(e.target.value) })} /></Field>
        <Field label="Disputed / on-hold accounts"><select value={p.exceptionPolicy} disabled={!admin} onChange={(e) => setP({ ...p, exceptionPolicy: e.target.value })}>
          <option value="flag_only">Flag for review, no routine draft</option><option value="blocked_draft">Create a blocked draft for review</option></select></Field>
        <Field label="Remind before due date"><select value={String(p.includeNotYetDue)} disabled={!admin} onChange={(e) => setP({ ...p, includeNotYetDue: e.target.value === 'true' })}><option value="true">Yes (courtesy reminder)</option><option value="false">No</option></select></Field>
        <Field label="Treat sync as stale after (hours)"><input type="number" value={p.staleSyncHours} disabled={!admin} onChange={(e) => setP({ ...p, staleSyncHours: Number(e.target.value) })} /></Field>
        <Field label="Scheduled sheet sync (cron, Asia/Manila)"><input value={p.syncCron} disabled={!admin} onChange={(e) => setP({ ...p, syncCron: e.target.value })} /></Field>
        <Field label="Reviewer notification emails (internal)"><input value={(p.reviewerNotifyEmails || []).join(', ')} disabled={!admin} onChange={(e) => setP({ ...p, reviewerNotifyEmails: e.target.value.split(/[,\s]+/).filter(Boolean) })} /></Field>
        <Field label="Allow self-approval (company policy exception)"><select value={String(p.allowSelfApproval)} disabled={!admin} onChange={(e) => setP({ ...p, allowSelfApproval: e.target.value === 'true' })}><option value="false">No (recommended)</option><option value="true">Yes – audited</option></select></Field>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>The Monday collection run is fixed at 08:00 Asia/Manila. Schedule changes take effect after a server restart.</div>
      {admin && <div className="row" style={{ marginTop: 10 }}><Action className="btn primary" label="Save policies" prompt="Reason for the policy change" run={(reason) => api.put('/settings/policy', { value: p, reason })} onDone={reload} /></div>}
    </div>
  );
}

function Users({ user }) {
  const admin = hasRole(user, 'sysadmin');
  const { data, error, reload } = useLoad(admin || hasRole(user, 'management') ? '/users' : null);
  const [n, setN] = useState({ email: '', name: '', password: '', roles: [] });
  const ROLES = ['accounting', 'approver', 'sender', 'management', 'sysadmin'];
  const toggle = (arr, r) => (arr.includes(r) ? arr.filter((x) => x !== r) : [...arr, r]);
  return (
    <div className="card">
      <h2>Users &amp; roles</h2>
      <Err error={error} />
      <Table rows={data} columns={[{ key: 'email', label: 'Email' }, { key: 'name', label: 'Name' },
        { label: 'Roles', render: (r) => <div className="row">{ROLES.map((x) => <label key={x} className="row small"><input type="checkbox" disabled={!admin} checked={r.roles.includes(x)} onChange={() => api.patch(`/users/${r.id}`, { roles: toggle(r.roles, x) }).then(reload).catch((e) => alert(e.message))} />{x}</label>)}</div> },
        { label: 'Active', render: (r) => <input type="checkbox" disabled={!admin} checked={r.active} onChange={() => api.patch(`/users/${r.id}`, { active: !r.active }).then(reload).catch((e) => alert(e.message))} /> }]} />
      {admin && <><h3>Add user</h3><div className="form">
        <Field label="Email"><input value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></Field>
        <Field label="Name"><input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Initial password (min 10)"><input type="password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} /></Field>
        <div className="row">{ROLES.map((x) => <label key={x} className="row small"><input type="checkbox" checked={n.roles.includes(x)} onChange={() => setN({ ...n, roles: toggle(n.roles, x) })} />{x}</label>)}</div>
      </div><div style={{ marginTop: 10 }}><Action className="btn primary" label="Create user" run={() => api.post('/users', n)} onDone={() => { setN({ email: '', name: '', password: '', roles: [] }); reload(); }} /></div></>}
    </div>
  );
}
