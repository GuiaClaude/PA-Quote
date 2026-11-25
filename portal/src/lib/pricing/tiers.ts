import Decimal from "decimal.js";

/**
 * Quote tier maths. Staff type either the TOTAL or the UNIT price; the other
 * is derived exactly (decimal maths, never floats).
 *   total (₱)  -> centavos, unit = total / qty rounded to 4 decimals
 *   unit (₱)   -> total = unit × qty rounded half-up to the centavo
 */
export function tierFromTotal(quantity: number, totalPesos: string): { unit: string; totalCentavos: number } {
  let total: Decimal;
  try { total = new Decimal(totalPesos.replace(/[₱,\s]/g, "")); } catch { throw new Error("Enter a price above zero."); }
  if (!total.isFinite() || total.lte(0) || quantity <= 0) throw new Error("Enter a price above zero.");
  const centavos = total.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return { unit: centavos.div(100).div(quantity).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4), totalCentavos: centavos.toNumber() };
}

export function tierFromUnit(quantity: number, unitPesos: string): { unit: string; totalCentavos: number } {
  let unit: Decimal;
  try { unit = new Decimal(unitPesos.replace(/[₱,\s]/g, "")).toDecimalPlaces(4, Decimal.ROUND_HALF_UP); } catch { throw new Error("Enter a price above zero."); }
  if (!unit.isFinite() || unit.lte(0) || quantity <= 0) throw new Error("Enter a price above zero.");
  return { unit: unit.toFixed(4), totalCentavos: unit.mul(quantity).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() };
}
