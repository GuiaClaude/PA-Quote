// Generates the app icons and iPhone splash screens from one SVG mark.
// Run: node scripts/make-icons.mjs   (re-run after changing the colours below)
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const NAVY = "#0f1b2d", TEAL = "#00AEBF", PINK = "#E0295A";

// A stack of printed sheets: the front sheet carries a teal and a pink band.
const mark = (size, pad) => {
  const s = size - pad * 2, x = pad, y = pad;
  const u = s / 100;
  return `
    <rect x="${x + 26 * u}" y="${y + 12 * u}" width="${52 * u}" height="${66 * u}" rx="${5 * u}" fill="#ffffff" opacity="0.35"/>
    <rect x="${x + 20 * u}" y="${y + 18 * u}" width="${52 * u}" height="${66 * u}" rx="${5 * u}" fill="#ffffff" opacity="0.6"/>
    <rect x="${x + 14 * u}" y="${y + 24 * u}" width="${52 * u}" height="${66 * u}" rx="${5 * u}" fill="#ffffff"/>
    <rect x="${x + 21 * u}" y="${y + 33 * u}" width="${38 * u}" height="${9 * u}" rx="${2 * u}" fill="${TEAL}"/>
    <rect x="${x + 21 * u}" y="${y + 47 * u}" width="${26 * u}" height="${9 * u}" rx="${2 * u}" fill="${PINK}"/>
    <rect x="${x + 21 * u}" y="${y + 62 * u}" width="${38 * u}" height="${4 * u}" rx="${2 * u}" fill="${NAVY}" opacity="0.25"/>
    <rect x="${x + 21 * u}" y="${y + 71 * u}" width="${30 * u}" height="${4 * u}" rx="${2 * u}" fill="${NAVY}" opacity="0.25"/>`;
};
const icon = (size, { round = true, pad = 0.12 } = {}) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="${NAVY}"/>${mark(size, size * pad)}</svg>`);

const out = async (buf, file, size) => sharp(buf).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

await out(icon(512, { round: false }), "public/icons/icon-512.png", 512);
await out(icon(512, { round: false }), "public/icons/icon-192.png", 192);
// Maskable: Android crops to a circle/squircle, so keep the mark in the middle 60%.
await out(icon(512, { round: false, pad: 0.2 }), "public/icons/maskable-512.png", 512);
await out(icon(512, { round: false }), "public/icons/apple-touch-icon.png", 180);
await out(icon(64), "public/icons/favicon-64.png", 64);
await writeFile("public/icons/icon.svg", icon(512).toString());

// iPhone splash screens (portrait). Android builds its own from the manifest.
const SPLASH = [[750, 1334, 2], [828, 1792, 2], [1125, 2436, 3], [1170, 2532, 3], [1179, 2556, 3], [1242, 2688, 3], [1284, 2778, 3], [1290, 2796, 3], [1320, 2868, 3]];
for (const [w, h] of SPLASH) {
  const m = Math.round(w * 0.32);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${NAVY}"/>
    <g transform="translate(${(w - m) / 2} ${(h - m) / 2 - h * 0.04})">${mark(m, 0)}</g></svg>`);
  await sharp(svg).png({ compressionLevel: 9 }).toFile(`public/splash/iphone-${w}x${h}.png`);
}
console.log("icons and splash screens written");
