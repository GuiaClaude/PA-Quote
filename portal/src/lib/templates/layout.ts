/**
 * Pure layout maths for editable fields (shared by the browser canvas and tests).
 * Box positions are percentages of the preview; font sizes are points on the
 * printed page, converted with the page size recorded when the preview was made.
 */
export type FieldBox = { x_pct: number; y_pct: number; w_pct: number; h_pct: number };

/** Pixels per printed point at the size the preview is being drawn. */
export function pxPerPt(drawWidthPx: number, pageWidthPt: number | null | undefined, previewWidthPx: number): number {
  // Without a known page size (image uploads), assume the preview was 150 dpi.
  const widthPt = pageWidthPt && pageWidthPt > 0 ? pageWidthPt : (previewWidthPx * 72) / 150;
  return drawWidthPx / widthPt;
}

export function boxPx(box: FieldBox, drawW: number, drawH: number) {
  return { x: (box.x_pct / 100) * drawW, y: (box.y_pct / 100) * drawH, w: (box.w_pct / 100) * drawW, h: (box.h_pct / 100) * drawH };
}

/**
 * Largest font size (≤ wanted, ≥ 50% of wanted) at which the text fits the
 * box width and height. `measure(sizePx)` returns the text width at that size.
 */
export function fitFontSize(wantedPx: number, boxW: number, boxH: number, measure: (sizePx: number) => number): number {
  const min = Math.max(4, Math.min(wantedPx * 0.5, boxH * 0.95));
  let size = Math.min(wantedPx, boxH * 0.95);
  while (size > min && measure(size) > boxW) size -= Math.max(0.25, size * 0.03);
  return Math.max(min, size);
}

export function textX(align: "left" | "center" | "right", x: number, w: number): number {
  return align === "center" ? x + w / 2 : align === "right" ? x + w : x;
}

/** A field is drawn only when the client changed it (otherwise the artwork already shows it). */
export function isChanged(value: string | undefined, defaultText: string): value is string {
  return value !== undefined && value.trim() !== defaultText.trim();
}
