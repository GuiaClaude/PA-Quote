// Date helpers. Business dates are 'YYYY-MM-DD' strings interpreted in Asia/Manila.
export const TZ = 'Asia/Manila';

/** Manila calendar date for an instant. */
export function manilaDate(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Start of the given Manila date as a UTC instant. Manila has no DST (UTC+8). */
export function manilaDayStart(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`);
}
export function manilaDayEnd(dateStr) {
  return new Date(manilaDayStart(addDays(dateStr, 1)).getTime() - 1);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromStr, toStr) {
  return Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000);
}

/** Monday (Manila date) of the week containing the given Manila date. */
export function mondayOf(dateStr) {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Parse a spreadsheet date cell. Google Sheets UNFORMATTED_VALUE + SERIAL_NUMBER returns numbers
 * (days since 1899-12-30). Strings are parsed using the configured order (MDY or DMY) — never guessed.
 */
export function parseSheetDate(v, order = 'MDY') {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (isValidDateStr(s)) return s;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), m[3]];
    const [mo, da] = order === 'DMY' ? [b, a] : [a, b];
    const out = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    return isValidDateStr(out) ? out : undefined;
  }
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && months[m[1].slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()]) {
    const mo = months[m[1].slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()];
    const out = `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
    return isValidDateStr(out) ? out : undefined;
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]+(\d{4})$/);
  if (m && months[m[2].slice(0, 3).toLowerCase()]) {
    const out = `${m[3]}-${String(months[m[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    return isValidDateStr(out) ? out : undefined;
  }
  return undefined; // undefined = unparseable (distinct from null = blank)
}
