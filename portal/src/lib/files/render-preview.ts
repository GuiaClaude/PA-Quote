import "server-only";
import sharp from "sharp";
import { PREVIEW_LONG_EDGE, PREVIEW_MAX_PAGES, previewKind } from "./types";
import { watermark } from "./watermark";

export type RenderedPage = { pageNo: number; jpg: Buffer; width: number; height: number };
export type RenderResult =
  | { status: "ready"; pages: RenderedPage[]; totalPages: number }
  | { status: "unsupported"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Turn a print file into LOW-RES, WATERMARKED JPG previews (about 1,200 px
 * on the long edge, one per page). These are the only images clients ever
 * see. High-res files never leave the private bucket.
 *   PDF and PDF-compatible AI -> MuPDF
 *   JPG / PNG / TIFF           -> sharp
 *   PSD, EPS, INDD, ZIP, ...   -> "unsupported" (staff upload a preview JPG)
 */
export async function renderPreviews(data: Uint8Array): Promise<RenderResult> {
  const kind = previewKind(data.subarray(0, 1024));
  try {
    if (kind === "pdf") return await renderPdf(data);
    if (kind === "image") {
      const page = await renderImage(data);
      return { status: "ready", pages: [{ ...page, pageNo: 1 }], totalPages: 1 };
    }
    return { status: "unsupported", reason: "No automatic preview for this file type. Upload a preview JPG." };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message.slice(0, 300) : "Could not read the file." };
  }
}

async function renderPdf(data: Uint8Array): Promise<RenderResult> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  try {
    if (doc.needsPassword()) return { status: "unsupported", reason: "This PDF is password-protected." };
    const total = doc.countPages();
    const pages: RenderedPage[] = [];
    for (let i = 0; i < Math.min(total, PREVIEW_MAX_PAGES); i++) {
      const page = doc.loadPage(i);
      const [x0, y0, x1, y1] = page.getBounds();
      const longest = Math.max(x1 - x0, y1 - y0) || 1;
      // Never upscale tiny pages beyond 2x; always cap at ~1,200 px.
      const scale = Math.min(PREVIEW_LONG_EDGE / longest, 2 * (PREVIEW_LONG_EDGE / 600));
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      pix.destroy();
      page.destroy();
      pages.push({ ...(await finish(png)), pageNo: i + 1 });
    }
    return { status: "ready", pages, totalPages: total };
  } finally {
    doc.destroy();
  }
}

async function renderImage(data: Uint8Array) {
  // First frame/page only; respect EXIF rotation; convert CMYK to sRGB.
  const png = await sharp(data, { pages: 1, limitInputPixels: 400_000_000 })
    .rotate()
    .resize(PREVIEW_LONG_EDGE, PREVIEW_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .png()
    .toBuffer();
  return finish(png);
}

/** Resize to the preview size, add the watermark, encode as JPG, strip metadata. */
async function finish(png: Buffer) {
  const base = sharp(png).resize(PREVIEW_LONG_EDGE, PREVIEW_LONG_EDGE, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" });
  const { data, info } = await base.png().toBuffer({ resolveWithObject: true });
  const marks = await watermark(info.width, info.height);
  const jpg = await sharp(data).composite(marks).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  return { jpg, width: info.width, height: info.height };
}

/** A staff-uploaded preview image (for PSD/ZIP/etc.) goes through the same resize + watermark. */
export async function processManualPreview(data: Uint8Array): Promise<RenderedPage> {
  if (previewKind(data.subarray(0, 1024)) !== "image") throw new Error("Upload a JPG or PNG preview.");
  return { ...(await renderImage(data)), pageNo: 1 };
}
