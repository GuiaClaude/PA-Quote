/**
 * Generates simple but realistic-looking DEMO print files (PDFs) for the demo
 * seed and the tests: brochure, business card, label, price tag, carton.
 * Not used for real clients.
 */
type RGB = [number, number, number];
type Shape = { rect: [number, number, number, number]; fill: RGB } | { text: string; at: [number, number]; size: number; fill: RGB; bold?: boolean };
type PageSpec = { width: number; height: number; shapes: Shape[] };

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mm = (v: number) => (v * 72) / 25.4;

export async function makePdf(pages: PageSpec[]): Promise<Uint8Array> {
  const mupdf = await import("mupdf");
  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, "pdf", "");
  const regular = new mupdf.Font("Helvetica");
  const bold = new mupdf.Font("Helvetica-Bold");
  for (const p of pages) {
    const dev = writer.beginPage([0, 0, p.width, p.height]);
    for (const s of p.shapes) {
      if ("rect" in s) {
        const path = new mupdf.Path();
        const [x, y, w, h] = s.rect;
        path.rect(x, y, x + w, y + h);
        dev.fillPath(path, false, mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, s.fill, 1);
      } else {
        const text = new mupdf.Text();
        text.showString(s.bold ? bold : regular, [s.size, 0, 0, -s.size, s.at[0], s.at[1]], s.text);
        dev.fillText(text, mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, s.fill, 1);
      }
    }
    writer.endPage();
  }
  writer.close();
  return buf.asUint8Array();
}

const W: RGB = [1, 1, 1];
const INK: RGB = hex("#1b2a4a");

export const DEMO_ARTWORK = {
  brochure: (year: string, hotline: string) => makePdf([
    { width: mm(297), height: mm(210), shapes: [
      { rect: [0, 0, mm(297), mm(210)], fill: hex("#f4f7fb") },
      { rect: [mm(198), 0, mm(99), mm(210)], fill: hex("#1d4ed8") },
      { rect: [mm(8), mm(6), mm(60), mm(20)], fill: hex("#1d4ed8") },
      { text: "ABC", at: [mm(14), mm(20)], size: 30, fill: W, bold: true },
      { text: `Product Catalogue ${year}`, at: [mm(206), mm(40)], size: 22, fill: W, bold: true },
      { text: "Quality you can count on", at: [mm(206), mm(52)], size: 12, fill: W },
      { rect: [mm(206), mm(70), mm(83), mm(70)], fill: hex("#93c5fd") },
      { text: "Model X200", at: [mm(110), mm(40)], size: 16, fill: INK, bold: true },
      { rect: [mm(105), mm(48), mm(85), mm(60)], fill: hex("#cbd5e1") },
      { text: `Hotline: ${hotline}`, at: [mm(206), mm(190)], size: 12, fill: W, bold: true },
      { text: "www.abccorp-demo.test", at: [mm(206), mm(198)], size: 10, fill: W },
    ] },
    { width: mm(297), height: mm(210), shapes: [
      { rect: [0, 0, mm(297), mm(210)], fill: W },
      { text: "Our products", at: [mm(12), mm(24)], size: 22, fill: INK, bold: true },
      ...[0, 1, 2].map((i) => ({ rect: [mm(12 + i * 95), mm(36), mm(85), mm(70)] as [number, number, number, number], fill: hex(["#fde68a", "#a7f3d0", "#fecaca"][i]!) })),
      ...["Model X100", "Model X200", "Model X300"].map((n, i) => ({ text: n, at: [mm(14 + i * 95), mm(118)] as [number, number], size: 13, fill: INK, bold: true })),
      { text: "Skin tones must not go red - see colour standard", at: [mm(12), mm(190)], size: 9, fill: hex("#64748b") },
    ] },
  ]),
  businessCard: (name: string, title: string, phone: string, email: string) => makePdf([
    { width: mm(89), height: mm(51), shapes: [
      { rect: [0, 0, mm(89), mm(51)], fill: W },
      { rect: [0, 0, mm(89), mm(4)], fill: hex("#1d4ed8") },
      { text: "ABC Corporation", at: [mm(6), mm(13)], size: 9, fill: hex("#1d4ed8"), bold: true },
      { text: name, at: [mm(6), mm(25)], size: 11, fill: INK, bold: true },
      { text: title, at: [mm(6), mm(30)], size: 7, fill: hex("#4a5568") },
      { text: phone, at: [mm(6), mm(38)], size: 7, fill: INK },
      { text: email, at: [mm(6), mm(42)], size: 7, fill: INK },
    ] },
    { width: mm(89), height: mm(51), shapes: [
      { rect: [0, 0, mm(89), mm(51)], fill: hex("#1d4ed8") },
      { text: "ABC", at: [mm(30), mm(30)], size: 28, fill: W, bold: true },
    ] },
  ]),
  label: () => makePdf([{ width: mm(80), height: mm(50), shapes: [
    { rect: [0, 0, mm(80), mm(50)], fill: hex("#fff7ed") },
    { rect: [0, 0, mm(80), mm(12)], fill: hex("#f97316") },
    { text: "SUNRISE", at: [mm(5), mm(9)], size: 12, fill: W, bold: true },
    { text: "Mango Jam", at: [mm(5), mm(26)], size: 16, fill: hex("#9a3412"), bold: true },
    { text: "Net wt. 250 g  ·  Made in the Philippines", at: [mm(5), mm(34)], size: 6, fill: hex("#7c2d12") },
    { rect: [mm(55), mm(38), mm(20), mm(9)], fill: hex("#1f2937") },
  ] }]),
  priceTag: () => makePdf([{ width: mm(60), height: mm(30), shapes: [
    { rect: [0, 0, mm(60), mm(30)], fill: W },
    { rect: [0, mm(26), mm(60), mm(4)], fill: hex("#E0295A") },
    { text: "Mango Jam 250g", at: [mm(12), mm(8)], size: 9, fill: INK, bold: true },
    { text: "PHP 129.00", at: [mm(10), mm(19)], size: 16, fill: hex("#E0295A"), bold: true },
    { text: "SKU 4800001", at: [mm(21), mm(25)], size: 5, fill: hex("#4a5568") },
  ] }]),
  carton: () => makePdf([{ width: mm(460), height: mm(300), shapes: [
    { rect: [0, 0, mm(460), mm(300)], fill: hex("#d6b98c") },
    { rect: [mm(150), mm(100), mm(160), mm(80)], fill: hex("#f97316") },
    { text: "SUNRISE FOODS", at: [mm(165), mm(145)], size: 36, fill: W, bold: true },
    { text: "THIS SIDE UP  ·  HANDLE WITH CARE", at: [mm(150), mm(220)], size: 18, fill: hex("#111827"), bold: true },
  ] }]),
};
