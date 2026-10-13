import { query } from '../db.js';
import { audit } from './audit.js';

// Defaults deliberately contain NO company details, bank details, headers or spreadsheet IDs.
// Anything empty must be configured by an administrator before dependent features operate.
export const DEFAULTS = {
  sheet: {
    spreadsheetId: '',
    tabName: '',
    headerRow: 1,
    dateOrder: 'MDY',
    mapping: {},                 // internal field -> actual header text
    writableFields: [],          // internal fields enabled for write-back
    // Status vocabularies (case-insensitive exact match against cell values)
    paidValues: ['Paid'],
    partiallyPaidValues: [],
    deliveredValues: [],
    completedValues: [],
    cancelledValues: [],
    onHoldValues: [],
    disputedValues: [],
  },
  company: { name: 'Print Amplified OPC', address: '', phone: '', email: '', tin: '' },
  paymentInstructions: '',
  soaFolderId: '',
  policy: {
    allowSelfApproval: false,
    approvalExpiryHours: 72,
    exceptionPolicy: 'flag_only',  // flag_only | blocked_draft
    includeNotYetDue: true,
    staleSyncHours: 26,
    reviewerNotifyEmails: [],
    syncCron: '15 7-19 * * *',     // Asia/Manila; scheduled sheet sync
    dailyReportCron: '30 6 * * *',
  },
};

export async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key=$1', [key]);
  const def = DEFAULTS[key];
  if (!rows.length) return structuredClone(def);
  const v = rows[0].value;
  return def && typeof def === 'object' && !Array.isArray(def) ? { ...structuredClone(def), ...v } : v;
}

export async function getAllSettings() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = await getSetting(k);
  return out;
}

export async function setSetting(key, value, actor, reason) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting ${key}`);
  const before = await getSetting(key);
  await query(
    `INSERT INTO settings(key, value, updated_at, updated_by) VALUES ($1,$2,now(),$3)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [key, JSON.stringify(value), actor?.id ?? null],
  );
  await audit(null, actor, 'settings.update', 'setting', key, { before, after: value, reason });
}
