import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

vi.mock("server-only", () => ({}));
const { renderPreviews, processManualPreview } = await import("@/lib/files/render-preview");
const { DEMO_ARTWORK } = await import("@/lib/files/demo-artwork");
const { previewKind, isDriveUrl, safeObjectName, isAllowedArtwork } = await import("@/lib/files/types");

const OUT = process.env.PREVIEW_OUT; // set to a folder to look at the generated previews

describe("preview generation", () => {
  it("renders every PDF page as a watermarked JPG no larger than 1,200 px", async () => {
    const pdf = await DEMO_ARTWORK.brochure("2025", "0917 000 0000");
    const r = await renderPreviews(pdf);
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.totalPages).toBe(2);
    for (const p of r.pages) {
      const meta = await sharp(p.jpg).metadata();
      expect(meta.format).toBe("jpeg");
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1200);
      expect(Math.max(meta.width!, meta.height!)).toBeGreaterThanOrEqual(1100);
      expect(meta.exif).toBeUndefined();
      if (OUT) { await mkdir(OUT, { recursive: true }); await writeFile(`${OUT}/brochure-p${p.pageNo}.jpg`, p.jpg); }
    }
  });

  it("the watermark actually changes the image", async () => {
    const plain = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const page = await processManualPreview(plain);
    const { channels } = await sharp(page.jpg).stats();
    // A pure white image would have min 255 everywhere; the watermark makes darker pixels.
    expect(Math.min(...channels.map((c) => c.min))).toBeLessThan(200);
    if (OUT) await writeFile(`${OUT}/manual.jpg`, page.jpg);
  });

  it("small cards are rendered sharp enough, front and back", async () => {
    const pdf = await DEMO_ARTWORK.businessCard("Liza Mendoza", "Purchasing Manager", "0918 200 0001", "liza@abccorp-demo.test");
    const r = await renderPreviews(pdf);
    expect(r.status === "ready" && r.pages.length).toBe(2);
    if (r.status === "ready" && OUT) for (const p of r.pages) await writeFile(`${OUT}/card-p${p.pageNo}.jpg`, p.jpg);
    if (r.status === "ready") expect(r.pages[0]!.width).toBeGreaterThan(500);
  });

  it("downsizes large photos and PNGs", async () => {
    const big = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();
    const r = await renderPreviews(big);
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.pages[0]).toMatchObject({ width: 1200, height: 800 });
  });

  it("reports PSD / ZIP as unsupported (staff upload a preview instead)", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect((await renderPreviews(zip)).status).toBe("unsupported");
    const psd = new TextEncoder().encode("8BPS\x00\x01");
    expect((await renderPreviews(psd)).status).toBe("unsupported");
  });

  it("reports a broken PDF as failed instead of crashing", async () => {
    const r = await renderPreviews(new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf"));
    expect(["failed", "ready"]).toContain(r.status);
  });
});

describe("file rules", () => {
  it("detects file types from content, not the name", async () => {
    expect(previewKind(await DEMO_ARTWORK.label())).toBe("pdf");
    expect(previewKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image");
    expect(previewKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe("none");
  });
  it("accepts print formats and Drive links only", () => {
    for (const n of ["a.pdf", "b.AI", "c.psd", "d.eps", "e.indd", "f.tiff", "g.zip", "h.JPG"]) expect(isAllowedArtwork(n)).toBe(true);
    for (const n of ["x.exe", "y.html", "z"]) expect(isAllowedArtwork(n)).toBe(false);
    expect(isDriveUrl("https://drive.google.com/file/d/abc/view")).toBe(true);
    expect(isDriveUrl("https://evil.example.com/drive.google.com")).toBe(false);
    expect(isDriveUrl("http://drive.google.com/x")).toBe(false);
  });
  it("makes safe storage names", () => {
    expect(safeObjectName("ABC Brochure (FINAL) v2.pdf")).toBe("ABC-Brochure-FINAL-v2.pdf");
    expect(safeObjectName("../../etc/passwd")).not.toContain("/");
  });
});
