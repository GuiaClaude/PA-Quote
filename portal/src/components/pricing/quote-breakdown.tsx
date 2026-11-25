import Decimal from "decimal.js";
import type { InstantQuoteResult } from "@/lib/pricing/instant-quote";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

const peso = (v: string | number) => formatCentavos(new Decimal(v).mul(100).toDecimalPlaces(0).toNumber());

/** Line-by-line explanation of an instant quote (staff always; clients only if management allows). */
export function QuoteBreakdown({ result, baseDate, baseRef, vatRatePct, roundingStep }: {
  result: InstantQuoteResult; baseDate: string | null; baseRef?: string | null; vatRatePct: string | number; roundingStep: number;
}) {
  const p = result.price;
  if (!p) return <p className="text-sm text-muted-foreground">No confirmed past price for this quantity.</p>;
  const afterInflation = new Decimal(p.baseNet).mul(p.inflationFactor);
  return (
    <dl className="space-y-1.5 text-sm tabular">
      <Row label={`Past price${baseRef ? ` (${baseRef})` : ""}${baseDate ? ` · ${formatDate(baseDate)}` : ""}, VAT-exclusive`} value={peso(p.baseNet)} />
      <Row label={`Inflation × ${new Decimal(p.inflationFactor).toDecimalPlaces(4).toString()}`} value={peso(afterInflation.toString())} sub={p.years.map((y) => `${y.year}: ${y.ratePct}% × ${new Decimal(y.fraction).mul(100).toDecimalPlaces(0)}% of year${y.estimated ? " (estimated)" : ""}`).join(" · ")} />
      {Number(p.surchargePct) ? <Row label={`Material / category surcharge +${p.surchargePct}%`} value="" /> : null}
      {Number(p.clientAdjustmentPct) ? <Row label={`Client adjustment ${Number(p.clientAdjustmentPct) > 0 ? "+" : ""}${p.clientAdjustmentPct}%`} value="" /> : null}
      {p.capApplied ? <Row label="Client cap applied" value="" /> : null}
      {p.floorApplied ? <Row label="Minimum rule: not below the past price" value="" /> : null}
      {Number(p.addons) ? <Row label="Fixed add-ons" value={peso(p.addons)} /> : null}
      {Number(p.recharges) ? <Row label="One-time charges billed again" value={peso(p.recharges)} /> : null}
      <Row label="Before VAT and rounding" value={peso(p.preRoundNet)} />
      <Row label={`+ ${vatRatePct}% VAT, rounded up to ₱${roundingStep}`} value={formatCentavos(p.totalCentavos)} strong />
      <p className="pt-1 text-xs text-muted-foreground">Total change vs past price: {Number(p.adjustmentPct) >= 0 ? "+" : ""}{p.adjustmentPct}% · estimate age {p.ageYears} years</p>
      {result.reasons.length ? <p className="text-xs font-medium text-accent">Needs Quote: {result.reasons.map((r) => t.staffDash.reasons[r] ?? r).join(", ")}</p> : null}
    </dl>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={strong ? "border-t pt-1.5 font-bold" : ""}>
      <div className="flex justify-between gap-4"><dt className={strong ? "" : "text-muted-foreground"}>{label}</dt><dd>{value}</dd></div>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
