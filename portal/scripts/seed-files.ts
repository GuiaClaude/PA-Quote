/**
 * DEMO ONLY — puts real (generated) print files behind the demo seed's file
 * records and makes their previews, so the demo can be clicked through.
 *
 *   npm run seed:files
 *
 * Needs .env.local pointing at the DEMO Supabase project (after
 * `supabase db push --include-seed`). Never run it against the live project.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_ARTWORK } from "@/lib/files/demo-artwork";
import { processUploadedFile, refreshThumbnail } from "@/lib/files/process";

const ORG_A = "20000000-0000-4000-8000-00000000000a";

const FILES: Record<string, () => Promise<Uint8Array>> = {
  "52000000-0000-4000-8000-0000000000a1": () => DEMO_ARTWORK.brochure("2023", "(02) 8123 4567"),
  "52000000-0000-4000-8000-0000000000a5": () => DEMO_ARTWORK.brochure("2025", "0917 000 0000"),
  "52000000-0000-4000-8000-0000000000a6": async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("demo package")]),
  "52000000-0000-4000-8000-0000000000a2": () => DEMO_ARTWORK.businessCard("Liza Mendoza", "Purchasing Manager", "0918 200 0001", "liza.mendoza@abccorp-demo.test"),
  "52000000-0000-4000-8000-0000000000b1": () => DEMO_ARTWORK.label(),
  "52000000-0000-4000-8000-0000000000b2": () => DEMO_ARTWORK.priceTag(),
  "52000000-0000-4000-8000-0000000000b4": () => DEMO_ARTWORK.carton(),
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url || /order\.printamplified|prod/i.test(process.env.SEED_TARGET ?? "")) throw new Error("Set .env.local to the DEMO project.");
  const admin = supabaseAdmin();
  const { data: check } = await admin.from("organizations").select("id").eq("id", ORG_A).maybeSingle();
  if (!check) throw new Error("The demo seed isn't loaded in this project (ABC Corporation not found). Aborting.");

  for (const [fileId, make] of Object.entries(FILES)) {
    const { data: f } = await admin.from("files").select("storage_path, original_name").eq("id", fileId).single();
    if (!f?.storage_path) continue;
    const bytes = await make();
    const { error } = await admin.storage.from("print-files").upload(f.storage_path, bytes, {
      upsert: true, contentType: f.original_name?.endsWith(".zip") ? "application/zip" : "application/pdf",
    });
    if (error) { console.warn(`  ! ${f.original_name}: ${error.message}`); continue; }
    const r = await processUploadedFile(fileId);
    console.log(`  ${f.original_name}: ${r.status}${r.pages ? ` (${r.pages} page${r.pages > 1 ? "s" : ""})` : ""}`);
  }

  // A press-sheet photo for the brochure colour standard
  const mupdf = await import("mupdf");
  const pdf = mupdf.Document.openDocument(await DEMO_ARTWORK.brochure("2025", "0917 000 0000"), "application/pdf");
  const pagePng = Buffer.from(pdf.loadPage(0).toPixmap(mupdf.Matrix.scale(1.6, 1.6), mupdf.ColorSpace.DeviceRGB, false).asPNG());
  const photo = await sharp({ create: { width: 1700, height: 1250, channels: 3, background: "#d9dee6" } })
    .composite([{ input: await sharp(pagePng).resize(1500).toBuffer(), left: 100, top: 100 }])
    .modulate({ brightness: 0.97 }).jpeg({ quality: 85 }).toBuffer();
  const photoPath = `${ORG_A}/50000000-0000-4000-8000-0000000000a1/color/press-sheet-2025.jpg`;
  await admin.storage.from("print-files").upload(photoPath, photo, { upsert: true, contentType: "image/jpeg" });
  const { data: existing } = await admin.from("files").select("id").eq("storage_path", photoPath).maybeSingle();
  const photoId = existing?.id ?? (await admin.from("files").insert({
    organization_id: ORG_A, purpose: "color_standard_photo", kind: "upload", bucket: "print-files", storage_path: photoPath,
    original_name: "press-sheet-2025.jpg", mime_type: "image/jpeg", size_bytes: photo.byteLength,
  }).select("id").single()).data?.id;
  if (photoId && !existing) {
    await admin.from("color_standard_photos").insert({ organization_id: ORG_A, color_standard_id: "54000000-0000-4000-8000-0000000000a1", file_id: photoId, caption: "Approved press sheet, Feb 2025" });
  }
  if (photoId) console.log(`  press-sheet photo: ${(await processUploadedFile(photoId)).status}`);

  const { data: items } = await admin.from("print_items").select("id");
  for (const it of items ?? []) await refreshThumbnail(it.id as string);
  console.log("\nDemo files ready.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
