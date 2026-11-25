import { notFound } from "next/navigation";
import { renderPreviews } from "@/lib/files/render-preview";
import { DEMO_ARTWORK } from "@/lib/files/demo-artwork";
import { LabClient } from "./lab-client";
import type { ViewerPage } from "@/components/files/preview-viewer";
import type { CanvasField } from "@/components/templates/template-canvas";

/**
 * DEVELOPMENT ONLY (404 in production): renders the review/markup/compare
 * components with real generated previews and no database, so they can be
 * checked visually and with Playwright.
 */
export default async function Lab() {
  if (process.env.NODE_ENV === "production") notFound();
  const toPages = async (pdf: Promise<Uint8Array>, prefix: string): Promise<(ViewerPage & { pageWidthPt: number | null })[]> => {
    const r = await renderPreviews(await pdf);
    if (r.status !== "ready") return [];
    return r.pages.map((p) => ({
      id: `${prefix}-${p.pageNo}`, url: `data:image/jpeg;base64,${p.jpg.toString("base64")}`, width: p.width, height: p.height,
      pageNo: p.pageNo, side: r.pages.length === 2 ? (p.pageNo === 1 ? "front" : "back") : null, fileName: "Artwork", pageWidthPt: p.pageWidthPt ?? null,
    }));
  };
  const [card, card2, brochure] = await Promise.all([
    toPages(DEMO_ARTWORK.businessCard("Liza Mendoza", "Purchasing Manager", "0918 200 0001", "liza.mendoza@abccorp-demo.test"), "card"),
    toPages(DEMO_ARTWORK.businessCard("Liza Mendoza", "Purchasing Manager", "0917 123 4567", "liza.mendoza@abccorp-demo.test"), "card2"),
    toPages(DEMO_ARTWORK.brochure("2025", "0917 000 0000"), "bro"),
  ]);
  const f = (id: string, label: string, def: string, y: number, h: number, size: number, weight = 400, color = "#1B2A4A", w = 70): CanvasField => ({
    id, key: id, label, default_text: def, x_pct: 6, y_pct: y, w_pct: w, h_pct: h, font_size_pt: size, color_hex: color, align: "left",
    font_css: "Helvetica, Arial, sans-serif", font_weight: weight, cover_color: "#FFFFFF", max_chars: 40, font: null,
  });
  const fields = [
    f("name", "Name", "Liza Mendoza", 40.5, 11, 11, 700),
    f("position", "Position", "Purchasing Manager", 53.5, 7, 7, 400, "#4A5568"),
    f("phone", "Mobile", "0918 200 0001", 69, 7, 7, 400, "#1B2A4A", 60),
    f("email", "Email", "liza.mendoza@abccorp-demo.test", 77, 7, 7, 400, "#1B2A4A", 75),
  ];
  const front = card[0]!;
  return <LabClient card={card} card2={card2} brochure={brochure}
    template={{ backgroundUrl: front.url, previewWidth: front.width, previewHeight: front.height, pageWidthPt: front.pageWidthPt, fields }} />;
}
