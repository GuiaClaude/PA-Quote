import { FIELDS } from './fields.js';
import { parseSheetDate } from '../lib/dates.js';
import { toCents } from '../lib/money.js';
import { sha256, stableStringify } from '../lib/crypto.js';

export const normHeader = (h) => String(h ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
export const normJo = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));
export const normInvoice = (v) => normJo(v).toUpperCase();
export const normName = (v) => String(v ?? '').toLowerCase().replace(/[.,'"&()]/g, ' ').replace(/\b(inc|corp|corporation|co|opc|ltd|llc)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Column index (0-based) -> A1 column letters. */
export function colLetter(idx) {
  let n = idx + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Validate the mapping against the actual header row. */
export function resolveColumns(headerRow, mapping) {
  const index = new Map();
  const dupHeaders = new Set();
  (headerRow || []).forEach((h, i) => {
    const k = normHeader(h);
    if (!k) return;
    if (index.has(k)) dupHeaders.add(k); else index.set(k, i);
  });
  const columns = {};
  const errors = [];
  for (const [field, def] of Object.entries(FIELDS)) {
    const header = mapping?.[field];
    if (!header) {
      if (def.required) errors.push(`Required field "${def.label}" is not mapped`);
      continue;
    }
    const k = normHeader(header);
    if (dupHeaders.has(k)) errors.push(`Header "${header}" appears more than once; mapping is ambiguous`);
    else if (!index.has(k)) errors.push(`Mapped header "${header}" (${def.label}) was not found in the sheet`);
    else columns[field] = index.get(k);
  }
  return { columns, errors };
}

function convert(type, raw, dateOrder) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
  if (type === 'date') {
    const d = parseSheetDate(raw, dateOrder);
    return d === undefined ? { value: null, error: `unparseable date "${raw}"` } : { value: d };
  }
  if (type === 'money') {
    const c = toCents(raw);
    return c === null ? { value: null, error: `unparseable amount "${raw}"` } : { value: c };
  }
  return { value: String(raw).trim() };
}

/**
 * Parse a values grid (as returned by Sheets API) into normalized job order rows.
 * Row identity is the Job Order Number; the row number is recorded only as last-seen position.
 */
export function parseSheet(values, sheetCfg) {
  const headerIdx = (sheetCfg.headerRow || 1) - 1;
  const headerRow = values[headerIdx] || [];
  const { columns, errors } = resolveColumns(headerRow, sheetCfg.mapping);
  if (errors.length) return { ok: false, headerErrors: errors, rows: [], headers: headerRow };

  const rows = [];
  const issues = [];
  let blank = 0;
  for (let i = headerIdx + 1; i < values.length; i++) {
    const r = values[i] || [];
    const rowNumber = i + 1;
    const mappedVals = Object.values(columns).map((c) => r[c]);
    if (mappedVals.every((v) => v === null || v === undefined || String(v).trim() === '')) { blank++; continue; }
    const fields = {};
    const rowIssues = [];
    for (const [field, col] of Object.entries(columns)) {
      const { value, error } = convert(FIELDS[field].type, r[col], sheetCfg.dateOrder);
      fields[field] = value;
      if (error) rowIssues.push(`${FIELDS[field].label}: ${error}`);
    }
    fields.jo_number = normJo(fields.jo_number);
    const raw = {};
    headerRow.forEach((h, c) => { if (h !== '' && h != null) raw[String(h)] = r[c] ?? null; });
    const hash = sha256(stableStringify(fields));
    if (!fields.jo_number) {
      issues.push({ rowNumber, kind: 'missing_jo_number', message: `Row ${rowNumber} has data but no Job Order Number`, raw });
      continue;
    }
    rows.push({ rowNumber, fields, raw, hash, issues: rowIssues });
  }

  // Duplicate Job Order Numbers in the source are never auto-merged.
  const byJo = new Map();
  for (const row of rows) {
    const k = row.fields.jo_number.toUpperCase();
    byJo.set(k, [...(byJo.get(k) || []), row]);
  }
  const duplicates = [...byJo.values()].filter((g) => g.length > 1);
  const dupSet = new Set(duplicates.flat());
  return {
    ok: true,
    headers: headerRow,
    columns,
    rows: rows.filter((r) => !dupSet.has(r)),
    duplicates,
    issues,
    blank,
  };
}

const inVocab = (val, list) => !!val && (list || []).some((x) => String(x).trim().toLowerCase() === String(val).trim().toLowerCase());
export { inVocab };
