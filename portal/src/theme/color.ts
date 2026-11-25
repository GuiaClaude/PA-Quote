/** Colour helpers so brand colours chosen in Settings stay readable (WCAG AA). */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Bad colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Darken a colour step by step until white text on it reaches `target` contrast. */
export function readableOnWhiteText(hex: string, target = 4.5): string {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 40; i++) {
    const candidate = rgbToHex(rgb);
    if (contrastRatio(candidate, "#ffffff") >= target) return candidate;
    rgb = rgb.map((v) => v * 0.93) as [number, number, number];
  }
  return rgbToHex(rgb);
}

/** CSS variables to put on <html> for the brand colours from Settings. */
export function brandCssVars(primary: string, accent: string): Record<string, string> {
  const p = readableOnWhiteText(primary);
  return {
    "--brand": primary,
    "--accent-brand": accent,
    "--primary": p,
    "--primary-hover": readableOnWhiteText(p, 5.5),
    "--ring": p,
    "--accent": readableOnWhiteText(accent),
  };
}
