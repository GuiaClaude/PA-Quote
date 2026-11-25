import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canOrder } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { quoteForItem } from "@/lib/pricing/context";
import { PageHeader } from "@/components/layout/page-header";
import { SpecList } from "@/components/data/spec-list";
import { Card, CardContent } from "@/components/ui/card";
import { ReorderFlow, type TierOffer } from "@/components/reorder/reorder-flow";

export const metadata = { title: "Reorder" };

export default async function ReorderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClient();
  if (!canOrder(user.clientRole)) redirect(`/app/items/${id}`);
  const sb = await supabaseServer();
  // The user's own access decides whether they can see this item at all.
  const { data: item } = await sb.from("print_items").select("id, name, code, spec, approved_version_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();
  const [{ data: addresses }, { data: last }, { data: settings }, { data: openRevision }, base] = await Promise.all([
    sb.from("addresses").select("id, label, line1, city, is_default").is("deleted_at", null).order("is_default", { ascending: false }),
    sb.from("order_items").select("quantity, orders!inner(placed_at, order_no, client_po_no, delivery_address_id, status)").eq("print_item_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin().from("pricing_settings").select("show_breakdown_to_clients").lte("effective_from", new Date().toISOString()).order("version_no", { ascending: false }).limit(1).maybeSingle(),
    sb.from("revision_requests").select("id, status").eq("print_item_id", id).in("status", ["open", "in_prepress", "proof_sent"]).limit(1).maybeSingle(),
    quoteForItem({ printItemId: id, quantity: 0 }),
  ]);
  if (!base) notFound();
  const offers: TierOffer[] = [];
  for (const t of base.tiers) {
    const q = await quoteForItem({ printItemId: id, quantity: t.quantity });
    if (!q) continue;
    const p = q.result.price;
    offers.push({ quantity: t.quantity, status: q.result.status, reasons: q.result.reasons, totalCentavos: p?.totalCentavos ?? null, vatCentavos: p?.vatCentavos ?? null,
      unitPrice: p?.unitPrice ?? null, validUntil: q.result.validUntil, baseDate: t.baseDate, baseTotalCentavos: t.totalCentavos, adjustmentPct: p?.adjustmentPct ?? null,
      leadTime: q.item.leadTime });
  }
  const lastOrder = last ? (() => { const o = last.orders as unknown as { placed_at: string; order_no: string; client_po_no: string | null; delivery_address_id: string | null }; return { quantity: last.quantity as number, placedAt: o.placed_at, orderNo: o.order_no, addressId: o.delivery_address_id }; })() : null;
  return (
    <>
      <Link href={`/app/items/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{item.name as string}</Link>
      <PageHeader title={`Reorder: ${item.name as string}`} description="Same artwork and specs as before, priced at today's rates." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ReorderFlow printItemId={id} offers={offers} lastOrder={lastOrder} showBreakdown={Boolean(settings?.show_breakdown_to_clients)}
          hasApprovedArtwork={Boolean(item.approved_version_id)} openRevisionId={(openRevision?.id as string) ?? null}
          addresses={(addresses ?? []).map((a) => ({ id: a.id as string, label: a.label as string, line: `${a.line1}, ${a.city}`, isDefault: a.is_default as boolean }))} />
        <Card className="h-fit"><CardContent className="pt-5"><p className="mb-2 text-sm font-semibold">Specs</p><SpecList spec={item.spec as Record<string, unknown>} /></CardContent></Card>
      </div>
    </>
  );
}
