"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { specSchema, specSignature } from "@/lib/specs";
import { OPTION_KINDS, optionValue } from "@/lib/catalog/options";
import { pesosToCentavos } from "@/lib/money";
import type { ActionState } from "./account";

const uuid = z.uuid();
async function priceStaff() {
  const me = await getSessionUser();
  return me && (me.staffRole === "pa_admin" || me.staffRole === "pa_sales") && !me.needsMfa ? me : null;
}
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "item";
const done = (path: string, message: string): ActionState => { revalidatePath(path); revalidatePath("/app/order/new"); return { message }; };

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await priceStaff();
  if (!me) return { error: "Only management and sales can edit the catalog." };
  const p = z.object({ id: z.union([uuid, z.literal("")]).optional(), name: z.string().trim().min(2).max(80), description: z.string().max(300).optional(), sort: z.coerce.number().int().min(0).max(999).default(0), isActive: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Enter a category name." };
  const sb = await supabaseServer();
  const row = { name: p.data.name, description: p.data.description || null, sort: p.data.sort, is_active: p.data.isActive !== "off" };
  const { error } = p.data.id
    ? await sb.from("product_categories").update(row).eq("id", p.data.id)
    : await sb.from("product_categories").insert({ ...row, slug: `${slug(p.data.name)}-${Math.random().toString(36).slice(2, 5)}` });
  if (error) return { error: "Could not save the category." };
  await audit({ action: "catalog.category_saved", actorId: me.id, meta: row });
  return done("/staff/catalog", "Category saved.");
}

const productForm = z.object({
  id: z.union([uuid, z.literal("")]).optional(),
  categoryId: uuid, name: z.string().trim().min(2, "Enter the product name.").max(120),
  description: z.string().max(1000).optional(), leadTime: z.string().max(80).optional(),
  visibility: z.enum(["all", "selected"]), isActive: z.string().optional(), sort: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await priceStaff();
  if (!me) return { error: "Only management and sales can edit the catalog." };
  const p = productForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const clients = fd.getAll("clients").map(String).filter((x) => uuid.safeParse(x).success);
  if (p.data.visibility === "selected" && !clients.length) return { error: "Choose at least one client who can see this product." };
  const sb = await supabaseServer();
  const row = { category_id: p.data.categoryId, name: p.data.name, description: p.data.description || null, default_lead_time_text: p.data.leadTime || null,
    visibility: p.data.visibility, is_active: p.data.isActive === "on", sort: p.data.sort };
  let id = p.data.id || "";
  if (id) {
    const { error } = await sb.from("products").update(row).eq("id", id);
    if (error) return { error: "Could not save." };
  } else {
    const { data, error } = await sb.from("products").insert({ ...row, slug: `${slug(p.data.name)}-${Math.random().toString(36).slice(2, 5)}` }).select("id").single();
    if (error || !data) return { error: "Could not save." };
    id = data.id as string;
  }
  // visibility list (only clients this staff member manages are touched — database rules)
  await sb.from("product_visibility").delete().eq("product_id", id);
  if (p.data.visibility === "selected") await sb.from("product_visibility").insert(clients.map((c) => ({ product_id: id, organization_id: c })));
  await audit({ action: "catalog.product_saved", actorId: me.id, entityType: "product", entityId: id, meta: { ...row, clients } });
  if (!p.data.id) redirect(`/staff/catalog/products/${id}?created=1`);
  return done(`/staff/catalog/products/${id}`, "Product saved.");
}

export async function setProductPhotos(productId: string, paths: string[]): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(productId).success) return { error: "Not allowed." };
  const clean = paths.filter((p) => /^catalog\/[0-9a-f-]{36}\.(jpe?g|png|webp)$/.test(p)).slice(0, 8);
  const sb = await supabaseServer();
  const { error } = await sb.from("products").update({ photo_paths: clean }).eq("id", productId);
  if (error) return { error: "Could not save the photos." };
  return done(`/staff/catalog/products/${productId}`, "Photos saved.");
}

export async function saveOption(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await priceStaff();
  if (!me) return { error: "Not allowed." };
  const p = z.object({ productId: uuid, kind: z.enum(OPTION_KINDS), label: z.string().trim().min(1).max(120), gsm: z.string().optional(), quantities: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Enter the option." };
  const quantities = (p.data.quantities ?? "").split(/[\s,;/]+/).map((x) => Number(x.replace(/[^\d]/g, ""))).filter((n) => Number.isInteger(n) && n > 0);
  if (p.data.kind === "quantity" && !quantities.length) return { error: "Type the quantities, e.g. 100, 200, 500" };
  const gsm = p.data.gsm ? Number(p.data.gsm) : null;
  const sb = await supabaseServer();
  const { count } = await sb.from("product_options").select("id", { count: "exact", head: true }).eq("product_id", p.data.productId).eq("kind", p.data.kind);
  const { error } = await sb.from("product_options").insert({
    product_id: p.data.productId, kind: p.data.kind, sort: (count ?? 0) + 1,
    label: p.data.kind === "quantity" ? quantities.map((q) => q.toLocaleString("en-PH")).join(" / ") : p.data.label,
    value: optionValue(p.data.kind, p.data.label, { gsm: Number.isFinite(gsm) ? gsm : null, quantities }),
  });
  if (error) return { error: "Could not add the option." };
  return done(`/staff/catalog/products/${p.data.productId}`, "Option added.");
}

export async function removeOption(optionId: string, productId: string): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(optionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  await sb.from("product_options").update({ is_active: false }).eq("id", optionId);
  return done(`/staff/catalog/products/${productId}`, "Option removed.");
}

const priceForm = z.object({
  productId: uuid, quantity: z.coerce.number().int().positive().max(10_000_000), total: z.string().min(1),
  vatInclusive: z.string().optional(), validUntil: z.string().optional(), spec: z.string(),
});

/** Standard price for one spec + quantity. Clients can order these immediately. */
export async function saveStandardPrice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await priceStaff();
  if (!me) return { error: "Not allowed." };
  const p = priceForm.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Fill in the quantity and price." };
  let total: number;
  try { total = pesosToCentavos(p.data.total); } catch { return { error: "Type the total price in pesos, e.g. 1,250.00" }; }
  if (total <= 0) return { error: "The price must be more than zero." };
  let spec;
  try { spec = specSchema.parse(JSON.parse(p.data.spec)); } catch { return { error: "Choose the specs." }; }
  const unit = new Decimal(total).div(100).div(p.data.quantity).toDecimalPlaces(4).toString();
  const sb = await supabaseServer();
  const { error } = await sb.from("standard_prices").upsert({
    product_id: p.data.productId, spec, spec_signature: specSignature(spec), quantity: p.data.quantity, unit_price: unit,
    total_centavos: total, vat_inclusive: p.data.vatInclusive === "on", valid_until: p.data.validUntil || null, is_active: true,
  }, { onConflict: "product_id,spec_signature,quantity" });
  if (error) return { error: "Could not save the price." };
  await audit({ action: "catalog.standard_price_saved", actorId: me.id, entityType: "product", entityId: p.data.productId, meta: { spec, quantity: p.data.quantity, total } });
  return done(`/staff/catalog/products/${p.data.productId}`, "Price saved.");
}

export async function setStandardPriceActive(id: string, productId: string, active: boolean): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(id).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  await sb.from("standard_prices").update({ is_active: active }).eq("id", id);
  return done(`/staff/catalog/products/${productId}`, active ? "Price shown again." : "Price hidden.");
}
