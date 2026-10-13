import { Cron } from 'croner';
import { query } from './db.js';
import { runCollection, currentRunKey } from './services/collection.js';
import { runSync } from './services/sync.js';
import { getSetting } from './services/settings.js';
import { markStaleAttempts } from './services/email.js';
import { dailyReport, weeklyReport, mondayReport, monthlyReport, snapshot, unbilledReport } from './services/reports.js';
import { manilaDate, manilaDayStart, addDays, mondayOf } from './lib/dates.js';

export const TIMEZONE = 'Asia/Manila';           // IANA zone, not a fixed offset
export const MONDAY_CRON = '0 8 * * 1';          // Every Monday 08:00 Asia/Manila

export function nextMondayRun(from = new Date()) {
  return new Cron(MONDAY_CRON, { timezone: TIMEZONE, paused: true }).nextRun(from);
}

/** True if this week's Monday 08:00 Manila has passed and its run has not succeeded (e.g. server was down). */
export async function needsCatchUp(now = new Date()) {
  const key = currentRunKey(now);
  const due = new Date(`${key}T08:00:00+08:00`);
  if (now < due) return false;
  const { rows: [r] } = await query('SELECT status FROM collection_runs WHERE run_key=$1', [key]);
  return !r || r.status !== 'succeeded';
}

const log = (...a) => console.log(new Date().toISOString(), '[scheduler]', ...a);

export async function startScheduler() {
  const policy = await getSetting('policy');
  const jobs = [];
  const guarded = (name, fn) => async () => {
    try { log(name, 'start'); const r = await fn(); log(name, 'done', JSON.stringify(r)?.slice(0, 300)); } catch (e) { log(name, 'error', e.message); }
  };
  jobs.push(new Cron(MONDAY_CRON, { timezone: TIMEZONE, protect: true, name: 'monday-collection' },
    guarded('monday-collection', () => runCollection({ trigger: 'scheduled' }))));
  jobs.push(new Cron(policy.syncCron, { timezone: TIMEZONE, protect: true, name: 'sheet-sync' }, guarded('sheet-sync', () => runSync({ trigger: 'scheduled' }))));
  jobs.push(new Cron('*/10 * * * *', { timezone: TIMEZONE, protect: true }, guarded('stale-send-attempts', () => markStaleAttempts())));
  jobs.push(new Cron(policy.dailyReportCron, { timezone: TIMEZONE, protect: true }, guarded('daily-report', async () => {
    const d = manilaDate();
    await snapshot('daily', d, await dailyReport(d));
    await snapshot('unbilled', d, await unbilledReport(d));
  })));
  jobs.push(new Cron('0 18 * * 1', { timezone: TIMEZONE, protect: true }, guarded('monday-report', async () => {
    const k = currentRunKey();
    await snapshot('monday', k, await mondayReport(k));
  })));
  jobs.push(new Cron('0 7 * * 1', { timezone: TIMEZONE, protect: true }, guarded('weekly-report', async () => {
    const prev = addDays(mondayOf(manilaDate()), -7);
    await snapshot('weekly', prev, await weeklyReport(prev));
  })));
  jobs.push(new Cron('0 7 1 * *', { timezone: TIMEZONE, protect: true }, guarded('monthly-report', async () => {
    const d = new Date(manilaDayStart(manilaDate())); d.setUTCDate(0);
    const m = d.toISOString().slice(0, 7);
    await snapshot('monthly', m, await monthlyReport(m));
  })));
  log('next Monday collection run at', nextMondayRun()?.toISOString());
  if (await needsCatchUp()) {
    log('missed Monday run detected; running catch-up');
    guarded('monday-collection-catch-up', () => runCollection({ trigger: 'catch_up' }))();
  }
  return jobs;
}
