/**
 * Which files we accept, and which ones the server can turn into previews.
 * Shared by the uploader (browser) and the server.
 */
export const ARTWORK_EXTENSIONS = ["pdf", "ai", "psd", "eps", "indd", "tif", "tiff", "jpg", "jpeg", "png", "zip"] as const;
export const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "tif", "tiff"] as const;

export type PreviewKind = "pdf" | "image" | "none";

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

export function isAllowedArtwork(name: string): boolean {
  return (ARTWORK_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Short label for the file-type icon shown when there is no preview. */
export function fileTypeLabel(name: string): string {
  const ext = extensionOf(name);
  return ext === "jpeg" ? "JPG" : ext === "tiff" ? "TIF" : ext.toUpperCase() || "FILE";
}

/**
 * Decide how to preview a file from its first bytes (not its name — names lie).
 * PDF-compatible .ai files start with %PDF, so they render like PDFs.
 */
export function previewKind(head: Uint8Array): PreviewKind {
  const ascii = (n: number) => String.fromCharCode(...head.slice(0, n));
  if (ascii(5) === "%PDF-") return "pdf";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image"; // JPEG
  if (ascii(8) === "\x89PNG\r\n\x1a\n") return "image";
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 0x2a)) return "image"; // TIFF
  // %PDF may come after a short binary header in some .ai files
  const firstKb = String.fromCharCode(...head.slice(0, 1024));
  if (firstKb.includes("%PDF-")) return "pdf";
  return "none";
}

export const PREVIEW_LONG_EDGE = 1200;
export const PREVIEW_MAX_PAGES = 24;

/** Safe storage object name: keep letters, digits, dot, dash, underscore. */
export function safeObjectName(name: string): string {
  const ext = extensionOf(name);
  const base = name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

/** Accept only real Google Drive / Docs links. */
export function isDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ["drive.google.com", "docs.google.com"].includes(u.hostname);
  } catch {
    return false;
  }
}
