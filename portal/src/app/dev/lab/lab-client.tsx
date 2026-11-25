"use client";
import { useState } from "react";
import { ReviewClient } from "@/components/revisions/review-client";
import { CompareSlider } from "@/components/revisions/compare-slider";
import { TemplateDesigner } from "@/components/templates/template-designer";
import type { ViewerPage } from "@/components/files/preview-viewer";
import type { CanvasField } from "@/components/templates/template-canvas";

type P = ViewerPage & { pageWidthPt: number | null };
export function LabClient({ card, card2, brochure, template }: {
  card: P[]; card2: P[]; brochure: P[];
  template: { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] };
}) {
  const [view, setView] = useState<"review" | "compare" | "designer" | "brochure">("review");
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <nav className="flex gap-2 text-sm">{(["review", "compare", "designer", "brochure"] as const).map((v) => (
        <button key={v} data-view={v} onClick={() => setView(v)} className={`rounded border px-2 py-1 ${view === v ? "bg-primary text-white" : ""}`}>{v}</button>
      ))}</nav>
      {view === "review" ? <ReviewClient printItemId="lab" organizationId="lab" itemName="Business Card – Liza Mendoza" baseVersionId="lab" pages={card} template={template} maxMb={50} /> : null}
      {view === "brochure" ? <ReviewClient printItemId="lab" organizationId="lab" itemName="Product Brochure" baseVersionId="lab" pages={brochure} template={null} maxMb={50} startInRevise /> : null}
      {view === "compare" ? <CompareSlider before={card} after={card2} /> : null}
      {view === "designer" ? <TemplateDesigner printItemId="lab" pages={card} fonts={[]} initial={{ renditionId: card[0]!.id, fields: template.fields }} /> : null}
    </main>
  );
}
