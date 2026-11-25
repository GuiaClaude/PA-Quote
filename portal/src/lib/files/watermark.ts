import "server-only";
import sharp, { type OverlayOptions } from "sharp";

const TEXT = "Print Amplified - Preview Only";
let tileCache: Buffer | null = null;
const bandCache = new Map<number, Buffer>();

/**
 * Draw text with MuPDF's built-in Helvetica (works on servers without any
 * fonts installed, like Vercel) as BLACK on WHITE, and return it as a
 * single-channel "ink" mask (255 = ink, 0 = empty).
 */
async function inkMask(width: number, height: number, draw: (m: typeof import("mupdf"), dev: import("mupdf").Device) => void): Promise<Buffer> {
  const mupdf = await import("mupdf");
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  draw(mupdf, dev);
  dev.close();
  const png = Buffer.from(pix.asPNG());
  pix.destroy();
  return sharp(png).greyscale().negate().extractChannel(0).raw().toBuffer();
}

/** Solid colour image whose transparency comes from `mask` × opacity. */
async function colourise(mask: Buffer, width: number, height: number, rgb: [number, number, number], opacity: number): Promise<Buffer> {
  const alpha = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) alpha[i] = Math.round(mask[i]! * opacity);
  return sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Diagonal repeating text, light enough to read the artwork through it. */
async function tile(): Promise<Buffer> {
  if (tileCache) return tileCache;
  const w = 520, h = 260, size = 20;
  const t = (-25 * Math.PI) / 180;
  const mask = await inkMask(w, h, (m, dev) => {
    const text = new m.Text();
    // glyph space is y-up, the device is y-down: flip, then rotate
    text.showString(new m.Font("Helvetica-Bold"),
      [size * Math.cos(t), size * Math.sin(t), size * Math.sin(t), -size * Math.cos(t), 70, 200], TEXT);
    dev.fillText(text, m.Matrix.identity, m.ColorSpace.DeviceRGB, [0, 0, 0], 1);
  });
  tileCache = await colourise(mask, w, h, [70, 80, 95], 0.24);
  return tileCache;
}

/** Dark footer band: "Print Amplified - Preview Only · not for print". */
async function band(width: number): Promise<Buffer> {
  const cached = bandCache.get(width);
  if (cached) return cached;
  const h = 28;
  const mask = await inkMask(width, h, (m, dev) => {
    const text = new m.Text();
    text.showString(new m.Font("Helvetica-Bold"), [12, 0, 0, -12, 10, 19], `${TEXT}  ·  not for print`);
    dev.fillText(text, m.Matrix.identity, m.ColorSpace.DeviceRGB, [0, 0, 0], 1);
  });
  const textLayer = await colourise(mask, width, h, [255, 255, 255], 1);
  const out = await sharp({ create: { width, height: h, channels: 4, background: { r: 15, g: 27, b: 45, alpha: 0.75 } } })
    .composite([{ input: textLayer }])
    .png()
    .toBuffer();
  if (bandCache.size > 50) bandCache.clear();
  bandCache.set(width, out);
  return out;
}

export async function watermark(width: number, height: number): Promise<OverlayOptions[]> {
  const overlays: OverlayOptions[] = [{ input: await tile(), tile: true, left: 0, top: 0 }];
  if (height >= 120 && width >= 200) overlays.push({ input: await band(width), left: 0, top: height - 28 });
  return overlays;
}
