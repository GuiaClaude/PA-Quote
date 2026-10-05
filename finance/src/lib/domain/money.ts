/**
 * Money helpers. All amounts are integer CENTAVOS (₱1.00 = 100).
 * JavaScript numbers hold integers exactly up to 9,007,199,254,740,991,
 * i.e. about ₱90 trillion, far beyond anything this business needs.
 */

export type Centavos = number;

export const VAT_RATE_BP = 1200; // 12.00% in basis points

/** Round half away from zero to an integer (used for every centavo rounding). */
export function roundHalfUp(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

export function assertCentavos(c: number, label = "amount"): asserts c is Centavos {
  if (!Number.isSafeInteger(c)) throw new Error(`${label} must be a whole number of centavos, got ${c}`);
}

/** ₱1,234,567.89 (negative amounts as -₱1,234.00). */
export function formatPeso(c: Centavos, opts: { symbol?: boolean; blankZero?: boolean } = {}): string {
  const { symbol = true, blankZero = false } = opts;
  if (blankZero && c === 0) return "";
  const neg = c < 0;
  const abs = Math.abs(c);
  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;
  const body = `${pesos.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${symbol ? "₱" : ""}${body}`;
}

/** Compact form for charts and tiles: ₱1.2M, ₱845K, ₱950. */
export function formatPesoCompact(c: Centavos): string {
  const p = c / 100;
  const abs = Math.abs(p);
  const sign = p < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1_000) return `${sign}₱${Math.round(abs / 1_000)}K`;
  return `${sign}₱${Math.round(abs)}`;
}

const AMOUNT_ERRORS = /^#(REF!|DIV\/0!|N\/A|VALUE!|NAME\?|NUM!|NULL!)$/i;

export class AmountParseError extends Error {}

/**
 * Parse a peso amount written any of the ways found in the source workbooks:
 *   1234.5 · "1,234.50" · "PHP 2,130.76" · "₱1,234" · "(1,000.00)" · "-" · "" · "12, 345.67"
 *   "12.345.67" (period as thousands separator) · "1 234,50" is NOT supported (never seen).
 * Returns null for blank / dash. Throws AmountParseError for Excel errors and garbage.
 */
export function parseAmount(value: unknown): Centavos | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AmountParseError(`Not a finite number: ${value}`);
    // Excel keeps 15 significant digits; read the number the way Excel displays it
    // (1234.565 is stored as 1234.56499… but shown and meant as 1234.565 → 1234.57).
    const shown = String(Number(value.toPrecision(15)));
    if (/e/i.test(shown)) return roundHalfUp(value * 100);
    value = shown;
  }
  let s = String(value).trim();
  if (s === "" || /^[-–—]+$/.test(s)) return null;
  if (AMOUNT_ERRORS.test(s)) throw new AmountParseError(`Excel error value ${s}`);

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(PHP|Php|php|P|₱)\s*/u, "").replace(/\s*(PHP|php)$/u, "").trim();
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  s = s.replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(s)) throw new AmountParseError(`Not an amount: ${String(value)}`);

  // "12.345.67" → more than one period: all but the last are thousands separators.
  const periods = (s.match(/\./g) ?? []).length;
  if (periods > 1) {
    const last = s.lastIndexOf(".");
    s = s.slice(0, last).replace(/\./g, "") + s.slice(last);
  }
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new AmountParseError(`Not an amount: ${String(value)}`);

  const [whole, frac = ""] = s.split(".");
  // Work on the digit string to avoid binary float error, rounding at the 3rd decimal.
  const cents2 = (frac + "000").slice(0, 3);
  let c = Number(whole) * 100 + Number(cents2.slice(0, 2));
  if (Number(cents2[2]) >= 5) c += 1;
  return negative ? -c : c;
}

/** Peso text typed in a form ("1,234.50") → centavos. Blank → 0. */
export function pesoInputToCentavos(input: string): Centavos {
  return parseAmount(input) ?? 0;
}

/**
 * Split a VAT-inclusive amount into net and VAT.
 * net = round(gross × 10000 / (10000 + rate)); VAT = gross − net,
 * so the two parts always add back exactly to the gross.
 */
export function splitVatInclusive(gross: Centavos, rateBp: number = VAT_RATE_BP): { net: Centavos; vat: Centavos } {
  assertCentavos(gross, "gross");
  if (rateBp === 0) return { net: gross, vat: 0 };
  const net = roundHalfUp((gross * 10000) / (10000 + rateBp));
  return { net, vat: gross - net };
}

/** VAT on a net amount: round(net × rate). */
export function vatOnNet(net: Centavos, rateBp: number = VAT_RATE_BP): Centavos {
  return roundHalfUp((net * rateBp) / 10000);
}

/** Withholding (CWT/EWT) on the net-of-VAT base: round(net × rate). */
export function withholdingOnNet(net: Centavos, rateBp: number): Centavos {
  return roundHalfUp((net * rateBp) / 10000);
}

/** Share of `part` in `total`, applied to `amount` (used to move deferred VAT on partial payments). */
export function prorate(amount: Centavos, part: Centavos, total: Centavos): Centavos {
  if (total === 0) return 0;
  return roundHalfUp((amount * part) / total);
}

export function sum(values: readonly Centavos[]): Centavos {
  return values.reduce((a, b) => a + b, 0);
}

/** Basis points → "2%" / "1.79%". */
export function formatRateBp(bp: number): string {
  return `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}
