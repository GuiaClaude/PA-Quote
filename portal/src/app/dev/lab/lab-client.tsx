"use client";
import { useState } from "react";
import { ReviewClient } from "@/components/revisions/review-client";
import { CompareSlider } from "@/components/revisions/compare-slider";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { OrderWizard } from "@/components/ordering/order-wizard";
import { QuoteDecision } from "@/components/ordering/quote-decision";
import { QuoteBuilder } from "@/components/ordering/quote-builder";
import { optionValue, type CatalogOption } from "@/lib/catalog/options";

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

type P = ViewerPage & { pageWidthPt: number | null };
export function LabClient({ card, card2, brochure, template }: {
  card: P[]; card2: P[]; brochure: P[];
  template: { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] };
}) {
  const [view, setView] = useState<string>("review");
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <nav className="flex flex-wrap gap-2 text-sm">{["review", "compare", "designer", "brochure", "order", "quote", "builder"].map((v) => (
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
      {view === "designer" ? <TemplateDesigner printItemId="lab" pages={card} fonts={[]} initial={{ renditionId: card[0]!.id, fields: template.fields }} /> : null}
    </main>
  );
}
