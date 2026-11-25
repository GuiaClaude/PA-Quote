"use client";
import { useState } from "react";
import { ReviewClient } from "@/components/revisions/review-client";
import { CompareSlider } from "@/components/revisions/compare-slider";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { OrderWizard } from "@/components/ordering/order-wizard";
import { QuoteDecision } from "@/components/ordering/quote-decision";
import { QuoteBuilder } from "@/components/ordering/quote-builder";
import { optionValue, type CatalogOption } from "@/lib/catalog/options";
import { ReorderFlow } from "@/components/reorder/reorder-flow";
import { CartView } from "@/components/reorder/cart-view";
import { EstimateEditor } from "@/components/estimates/estimate-editor";

const OPTS: CatalogOption[] = [
  { id: "s1", kind: "size", label: '2" x 3.5"', value: optionValue("size", "2x3.5in") },
  { id: "m1", kind: "material", label: "C2S 300gsm (Carolina)", value: optionValue("material", "Carolina C2S", { gsm: 300 }) },
  { id: "m2", kind: "material", label: "Linen 270gsm", value: optionValue("material", "Linen", { gsm: 270 }) },
  { id: "c1", kind: "colors", label: "4/4 — full colour both sides", value: optionValue("colors", "4/4") },
  { id: "f1", kind: "finishing", label: "Matte lamination both sides", value: optionValue("finishing", "matte lamination 2 sides") },
  { id: "f2", kind: "finishing", label: "Spot UV", value: optionValue("finishing", "spot UV") },
  { id: "q1", kind: "quantity", label: "100 / 200 / 500 / 1,000", value: optionValue("quantity", "", { quantities: [100, 200, 500, 1000] }) },
];
const SPEC = { size: "2x3.5in", material: "Carolina C2S", gsm: 300, colors: "4/4", finishing: ["matte lamination 2 sides"] };
const PRICES = [100, 200, 500].map((q, i) => ({ id: `p${q}`, spec: SPEC, quantity: q, unit_price: ["6.5000", "4.2500", "2.6000"][i]!, total_centavos: [65000, 85000, 130000][i]!, vat_inclusive: true }));
import type { ViewerPage } from "@/components/files/preview-viewer";
import type { CanvasField } from "@/components/templates/template-canvas";

const ADDR = [{ id: "a1", label: "Head office", line: "5F Tower One, Ayala Ave, Makati", isDefault: true }, { id: "a2", label: "Warehouse", line: "Km 23 East Service Rd, Muntinlupa", isDefault: false }];
type P = ViewerPage & { pageWidthPt: number | null };
export function LabClient({ card, card2, brochure, template }: {
  card: P[]; card2: P[]; brochure: P[];
  template: { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] };
}) {
  const [view, setView] = useState<string>("review");
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <nav className="flex flex-wrap gap-2 text-sm">{["review", "compare", "designer", "brochure", "order", "quote", "builder", "reorder", "cart", "estimate"].map((v) => (
        <button key={v} data-view={v} onClick={() => setView(v)} className={`rounded border px-2 py-1 ${view === v ? "bg-primary text-white" : ""}`}>{v}</button>
      ))}</nav>
      {view === "review" ? <ReviewClient printItemId="lab" organizationId="lab" itemName="Business Card – Liza Mendoza" baseVersionId="lab" pages={card} template={template} maxMb={50} /> : null}
      {view === "brochure" ? <ReviewClient printItemId="lab" organizationId="lab" itemName="Product Brochure" baseVersionId="lab" pages={brochure} template={null} maxMb={50} startInRevise /> : null}
      {view === "compare" ? <CompareSlider before={card} after={card2} /> : null}
      {view === "order" ? <OrderWizard product={{ id: "lab", name: "Business Cards", photo: null, leadTime: "3–5 working days" }} organizationId="lab" options={OPTS} prices={PRICES}
        addresses={[{ id: "a1", label: "Head office", line: "12F ABC Tower, Ayala Avenue, Makati City", isDefault: true }, { id: "a2", label: "Warehouse – Laguna", line: "Lot 4 Phase 2, Cabuyao", isDefault: false }]} maxMb={50} draft={null} /> : null}
      {view === "quote" ? <QuoteDecision canAct quote={{ id: "q", quoteNo: "Q-2026-0004", leadTime: "3–5 working days", validUntil: "2026-12-10", vatInclusive: true, notes: "Includes stand and carry bag. Delivery within Metro Manila is free.",
        tiers: [{ id: "t1", quantity: 3, unit_price: "2950.0000", total_centavos: 885000 }, { id: "t2", quantity: 6, unit_price: "2750.0000", total_centavos: 1650000 }] }} /> : null}
      {view === "builder" ? <QuoteBuilder requestId="r" quantities={[2, 5]} leadTime="2–3 working days" validDefault="2026-12-10" revising={false} /> : null}
      {view === "reorder" ? <ReorderFlow printItemId="lab" showBreakdown={false} hasApprovedArtwork openRevisionId={null} addresses={ADDR}
        lastOrder={{ quantity: 1000, placedAt: "2025-03-10T02:00:00Z", orderNo: "PA-2025-0142", addressId: "a1" }}
        offers={[
          { quantity: 1000, status: "offered", reasons: [], totalCentavos: 2_098_000, vatCentavos: 224_786, unitPrice: "20.9800", validUntil: "2026-12-10", baseDate: "2025-03-10", baseTotalCentavos: 2_016_000, adjustmentPct: "4.07", leadTime: "5–7 working days" },
          { quantity: 2000, status: "offered", reasons: [], totalCentavos: 3_530_000, vatCentavos: 378_214, unitPrice: "17.6500", validUntil: "2026-12-10", baseDate: "2025-03-10", baseTotalCentavos: 3_392_000, adjustmentPct: "4.07", leadTime: "5–7 working days" },
          { quantity: 5000, status: "blocked", reasons: ["estimate_too_old"], totalCentavos: 6_900_000, vatCentavos: 739_286, unitPrice: "13.8000", validUntil: "2026-12-10", baseDate: "2022-05-18", baseTotalCentavos: 6_000_000, adjustmentPct: "15", leadTime: null },
        ]} /> : null}
      {view === "cart" ? <CartView addresses={ADDR} rows={[
        { printItemId: "1", name: "Product Brochure A4 Trifold", code: "ABC-BR-01", quantity: 1000, totalCentavos: 2_098_000, vatCentavos: 224_786, validUntil: "2026-12-10", stale: false },
        { printItemId: "2", name: "Business Card – Liza Mendoza", code: null, quantity: 200, totalCentavos: 96_500, vatCentavos: 10_339, validUntil: "2026-11-20", stale: true },
      ]} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {view === "estimate" ? <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"><img src={brochure[0]?.url} alt="Original estimate" className="w-full rounded border" />
        <EstimateEditor readOnly={false} aiAvailable items={[{ id: "i1", name: "Product Brochure A4 Trifold (ABC-BR-01)", spec: { size: "A4 trifold", material: "Gloss art", gsm: 150, colors: "4/4", finishing: ["fold"] } }]}
          values={{ id: "e1", printItemId: "i1", estimateNo: "CE-2025-0142", estimateDate: "2025-03-10", vatInclusive: true, validUntil: "", notes: "", extractedBy: "staff",
            spec: { size: "A4 trifold", material: "Gloss art", gsm: 150, colors: "4/4", finishing: ["fold"] },
            lines: [{ quantity: "1000", unitPrice: "20.1600", total: "20160.00" }, { quantity: "2000", unitPrice: "16.9600", total: "33920.00" }],
            charges: [{ label: "Plates", amount: "3500.00", recharge: false }] }} /></div> : null}
      {view === "designer" ? <TemplateDesigner printItemId="lab" pages={card} fonts={[]} initial={{ renditionId: card[0]!.id, fields: template.fields }} /> : null}
    </main>
  );
}
