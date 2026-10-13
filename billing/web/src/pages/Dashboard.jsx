import React from 'react';
import { useLoad, Kpi, peso, SyncBanner, Err, Action, hasRole, dt } from '../ui.jsx';
import { api } from '../api.js';

export default function Dashboard({ user }) {
  const { data, error, reload } = useLoad('/dashboard');
  if (error) return <Err error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const k = data.kpis;
  return (
    <>
      <SyncBanner sync={data.sync} />
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="small muted">All figures as of <b>{data.asOf}</b> (Asia/Manila), computed {dt(data.generatedAt)} from ledger and synchronized sheet records.</div>
        {hasRole(user, 'accounting', 'sysadmin') && <Action className="btn primary" label="Sync Now" run={() => api.post('/sync')} onDone={reload} />}
      </div>
      <div className="card"><h2>Job orders &amp; billing</h2><div className="grid">
        <Kpi label="Total job orders" value={k.totalJobOrders} sub="present in the Job Order List" />
        <Kpi label="Delivered, awaiting billing" value={k.deliveredAwaitingBilling} sub={<a href="#/unbilled">view list</a>} />
        <Kpi label="Unbilled delivered value" value={peso(k.unbilledValue)} sub={k.unbilledWithoutValue ? `${k.unbilledWithoutValue} without a value in sheet` : 'from sheet amounts'} />
        <Kpi label="Partially paid projects" value={k.partiallyPaid} />
        <Kpi label="Projects marked Paid" value={k.markedPaid} sub="master status in sheet" />
      </div></div>
      <div className="card"><h2>Receivables</h2><div className="grid">
        <Kpi label="Billed receivables (reconciled)" value={peso(k.billedReceivables)} />
        <Kpi label="Invoices pending reconciliation" value={peso(k.pendingReconciliation)} sub="not yet in statements" />
        <Kpi label="Total outstanding" value={peso(k.totalOutstanding)} sub="reconciled + pending" />
        <Kpi label="Total overdue" value={peso(k.totalOverdue)} />
        <Kpi label="Unapplied payments/credits" value={peso(k.unappliedCredits)} sub="shown separately" />
        <Kpi label="Collections this month" value={peso(k.collectionsThisMonth)} sub="verified payments only" />
      </div></div>
      <div className="card"><h2>Collection workflow</h2><div className="grid">
        <Kpi label={`Monday run ${k.mondayRunKey}`} value={k.mondayRunStatus.replace('_', ' ')} sub={<a href="#/runs">run history</a>} />
        <Kpi label="Drafts generated this week" value={k.mondayDraftsGenerated} />
        <Kpi label="Drafts awaiting approval" value={k.draftsAwaitingApproval} sub={k.draftsBlocked ? `${k.draftsBlocked} blocked` : <a href="#/approvals">open queue</a>} />
        <Kpi label="Approved, awaiting sending" value={k.approvedAwaitingSend} />
        <Kpi label="Emails sent" value={k.emailsSentThisWeek} sub={`this week · ${k.emailsSentTotal} total`} />
        <Kpi label="Failed / uncertain sends" value={k.failedEmailAttempts} />
        <Kpi label="Accounts requiring reconciliation" value={k.accountsRequiringReconciliation} sub={<a href="#/exceptions">exceptions</a>} />
      </div></div>
      <div className="card"><h2>Projects by stage</h2>
        <div className="row">{Object.entries(data.stageCounts).map(([s, n]) => <a key={s} href={`#/job-orders?stage=${encodeURIComponent(s)}`} className="badge">{s}: {n}</a>)}</div>
      </div>
    </>
  );
}
