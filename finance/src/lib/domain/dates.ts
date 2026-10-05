/**
 * Calendar-date helpers. Business dates are plain "YYYY-MM-DD" strings in the
 * Asia/Manila calendar (no time, no timezone drift). Display format is MM/DD/YYYY.
 */

export type ISODate = string; // "2026-10-05"

const MANILA = "Asia/Manila";

/** Today's date in Manila, regardless of the server's timezone. */
export function manilaToday(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseISO(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** 2026-10-05 → 10/05/2026 */
export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return "";
  const { y, m, d } = parseISO(iso.slice(0, 10));
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** 2026-10-05 → Oct 5, 2026 */
export function formatDateLong(iso: ISODate): string {
  const { y, m, d } = parseISO(iso);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayMon0(iso: ISODate): number {
  const { y, m, d } = parseISO(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// ───────────────────────────── Flexible parsing (imports) ─────────────────────────────

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

/** "JULY ", "Sept", "february" → 7, 9, 2. Returns null if not a month name. */
export function parseMonthName(s: string): number | null {
  const k = s.trim().toLowerCase().replace(/\.$/, "");
  return MONTH_LOOKUP[k] ?? null;
}

/** Excel 1900 date system serial → ISO date (handles Excel's fake 29-Feb-1900). */
export function excelSerialToISO(serial: number, date1904 = false): ISODate | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (date1904) {
    const t = new Date(Date.UTC(1904, 0, 1 + whole));
    return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (whole < 1) return null;
  // Serial 60 is the non-existent 1900-02-29; serials after it are shifted by one day.
  const offset = whole > 60 ? whole - 1 : whole;
  const t = new Date(Date.UTC(1899, 11, 31 + offset));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export interface ParsedDate {
  date: ISODate | null;
  /** True when day/month order could not be decided from the value alone. */
  ambiguous: boolean;
  /** Short explanation when the value could not be read. */
  error?: string;
}

export interface DateParseOptions {
  /** Treat "1/2/2024" as Jan 2 (true, default) or Feb 1. */
  monthFirst?: boolean;
  /** Plausible range for Excel serial numbers; outside it a number is not treated as a date. */
  serialRange?: [number, number];
  date1904?: boolean;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y + (y >= 70 ? 1900 : 2000);
}

/**
 * Reads every date shape found in the workbooks:
 *   Date objects · Excel serials (45470) · "02.16.2023" · "4.15.23" · "2-23-2023" · "6/19/2023"
 *   "2024-03-12" · "2024-03-12 00:00:00" · "February 20, 2024" · "Feb 16, 2023" · "16 Feb 2023"
 */
export function parseFlexibleDate(value: unknown, opts: DateParseOptions = {}): ParsedDate {
  const { monthFirst = true, serialRange = [20000, 80000], date1904 = false } = opts;
  if (value === null || value === undefined || value === "") return { date: null, ambiguous: false };

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { date: null, ambiguous: false, error: "Invalid date" };
    return { date: toISO(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()), ambiguous: false };
  }
  if (typeof value === "number") {
    if (value < serialRange[0] || value > serialRange[1]) {
      return { date: null, ambiguous: false, error: `Number ${value} is not a plausible date` };
    }
    return { date: excelSerialToISO(value, date1904), ambiguous: false };
  }

  const s = String(value).trim().replace(/\s+/g, " ");
  if (s === "") return { date: null, ambiguous: false };

  // ISO with optional time: 2024-03-12 / 2024-03-12 00:00:00 / 2024-03-12T00:00:00Z
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidYMD(y, mo, d) ? { date: toISO(y, mo, d), ambiguous: false } : { date: null, ambiguous: false, error: `Invalid date ${s}` };
  }

  // Numeric with . / - separators: a.b.c
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = expandYear(Number(m[3]));
    let mo: number, d: number, ambiguous = false;
    if (a > 12 && b <= 12) [d, mo] = [a, b];
    else if (b > 12 && a <= 12) [mo, d] = [a, b];
    else {
      [mo, d] = monthFirst ? [a, b] : [b, a];
      ambiguous = a !== b && a <= 12 && b <= 12;
    }
    return isValidYMD(y, mo, d) ? { date: toISO(y, mo, d), ambiguous } : { date: null, ambiguous: false, error: `Invalid date ${s}` };
  }

  // Month name forms: "February 20, 2024", "Feb 16 2023", "APRil 2, 2024"
  m = /^([A-Za-z]+)\.? (\d{1,2}),? (\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = parseMonthName(m[1]!);
    const d = Number(m[2]);
    const y = expandYear(Number(m[3]));
    if (mo && isValidYMD(y, mo, d)) return { date: toISO(y, mo, d), ambiguous: false };
  }
  // "16 Feb 2023", "16-Feb-23"
  m = /^(\d{1,2})[ -]([A-Za-z]+)\.?[ -](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = parseMonthName(m[2]!);
    const d = Number(m[1]);
    const y = expandYear(Number(m[3]));
    if (mo && isValidYMD(y, mo, d)) return { date: toISO(y, mo, d), ambiguous: false };
  }
  // A bare serial typed as text: "45470"
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseFlexibleDate(Number(s), opts);

  return { date: null, ambiguous: false, error: `Unrecognised date "${s}"` };
}
