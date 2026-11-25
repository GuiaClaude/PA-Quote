import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { signCatalogPhotos } from "@/lib/data/catalog-photos";
import { PageHeader } from "@/components/layout/page-header";
import { OrderWizard } from "@/components/ordering/order-wizard";
import type { CatalogOption } from "@/lib/catalog/options";

export default async function ProductOrder({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { productId } = await params;
  const sp = await searchParams;
  const user = await requireClient();
  if (user.clientRole === "client_viewer") redirect("/app/order/new");
  const sb = await supabaseServer();
  const [{ data: p }, { data: addresses }, draft] = await Promise.all([
    sb.from("products").select("id, name, description, default_lead_time_text, photo_paths, product_options(id, kind, label, value, is_active, sort), standard_prices(id, spec, quantity, unit_price, total_centavos, vat_inclusive, is_active, valid_until)").eq("id", productId).maybeSingle(),
    sb.from("addresses").select("id, label, line1, city, is_default").is("deleted_at", null).order("is_default", { ascending: false }),
    sp.draft && /^[0-9a-f-]{36}$/.test(sp.draft) ? sb.from("draft_orders").select("id, payload").eq("id", sp.draft).is("deleted_at", null).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (!p) notFound();
  const photos = await signCatalogPhotos(sb, (p.photo_paths as string[]).slice(0, 1));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const options = ((p.product_options as unknown as Array<CatalogOption & { is_active: boolean; sort: number }>) ?? []).filter((o) => o.is_active).sort((a, b) => a.sort - b.sort);
  const prices = ((p.standard_prices as unknown as Array<{ id: string; spec: Record<string, unknown>; quantity: number; unit_price: string; total_centavos: number; vat_inclusive: boolean; is_active: boolean; valid_until: string | null }>) ?? [])
    .filter((s) => s.is_active && (!s.valid_until || s.valid_until >= today));
  return (
    <>
      <Link href="/app/order/new" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Catalog</Link>
      <PageHeader title={p.name as string} description={[p.description, p.default_lead_time_text ? `Lead time: ${p.default_lead_time_text}` : null].filter(Boolean).join(" · ")} />
      <OrderWizard
        product={{ id: p.id as string, name: p.name as string, photo: p.photo_paths && (p.photo_paths as string[])[0] ? photos[(p.photo_paths as string[])[0]!] ?? null : null, leadTime: (p.default_lead_time_text as string) ?? null }}
        organizationId={user.organizationId} options={options} prices={prices}
        addresses={(addresses ?? []).map((a) => ({ id: a.id as string, label: a.label as string, line: `${a.line1}, ${a.city}`, isDefault: a.is_default as boolean }))}
        maxMb={(await getSetting("uploads")).max_file_mb}
        draft={draft ? { id: draft.id as string, payload: draft.payload as Record<string, unknown> } : null} />
    </>
  );
}
