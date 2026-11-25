import Decimal from "decimal.js";

/**
 * Money helpers. Rule: amounts are integer CENTAVOS (₱1.00 = 100). Unit
 * prices may have up to 4 decimals and are handled with decimal.js.
 * Never use JavaScript floating-point maths for prices.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

/** 123450 -> "₱1,234.50" */
export function formatCentavos(centavos: number | bigint | string | null | undefined): string {
  if (centavos === null || centavos === undefined || centavos === "") return "—";
  const pesos = new Decimal(centavos.toString()).div(100);
  return php.format(pesos.toNumber());
}

/** "0.8550" -> "₱0.8550" (keeps up to 4 decimals for unit prices) */
export function formatUnitPrice(unit: number | string | null | undefined): string {
  if (unit === null || unit === undefined || unit === "") return "—";
  const d = new Decimal(unit.toString());
  const decimals = Math.min(4, Math.max(2, d.decimalPlaces()));
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(d.toNumber());
}

/** "1,234.50" or "1234.5" -> 123450 (throws on bad input) */
export function pesosToCentavos(input: string | number): number {
  const cleaned = input.toString().replace(/[₱,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`Not a peso amount: ${input}`);
  return new Decimal(cleaned).mul(100).toDecimalPlaces(0).toNumber();
}

export { Decimal };
