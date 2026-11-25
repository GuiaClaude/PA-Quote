import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ImageIcon, Palette } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpecList } from "@/components/data/spec-list";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClient();
  const prices = canSeePrices(user);
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items")
    .select("id, name, code, spec, tags, approved_version_id, product_categories(name), color_standards!print_items_color_standard_fk(pantone_refs, paper_stock, press_machine, notes, approved_by_name, approved_at)")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();
  const [{ data: tiers }, { data: history }, { data: version }] = await Promise.all([
    prices ? sb.from("price_tiers").select("quantity, unit_price, total_centavos, vat_inclusive, base_date").eq("print_item_id", id).eq("is_current", true).order("quantity") : Promise.resolve({ data: [] }),
    sb.from("order_items").select("quantity, orders(order_no, placed_at, status)").eq("print_item_id", id).limit(20),
    item.approved_version_id ? sb.from("artwork_versions").select("version_no, approved_at").eq("id", item.approved_version_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const cs = item.color_standards as unknown as { pantone_refs: string[]; paper_stock: string | null; press_machine: string | null; notes: string | null; approved_by_name: string | null; approved_at: string | null } | null;

  return (
    <>
      <Link href="/app/items" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.items.title}</Link>
      <PageHeader title={item.name as string} description={[(item.product_categories as unknown as { name: string } | null)?.name, item.code].filter(Boolean).join(" · ")}
        actions={version ? <Badge tone="success">{t.items.approved} · v{version.version_no as number}</Badge> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted text-muted-foreground"><ImageIcon className="size-12" aria-hidden /></div>
          <CardContent className="pt-4"><PhaseNotice phase={2}>The low-res, view-only preview of your approved artwork will appear here.</PhaseNotice></CardContent>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Specifications</CardTitle></CardHeader><CardContent><SpecList spec={item.spec as Record<string, unknown>} /></CardContent></Card>
          {cs ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-4" />Colour standard</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {cs.pantone_refs?.length ? <p>Pantone: <b>{cs.pantone_refs.join(", ")}</b></p> : null}
                {cs.paper_stock ? <p>Paper: {cs.paper_stock}</p> : null}
                {cs.press_machine ? <p>Press: {cs.press_machine}</p> : null}
                {cs.notes ? <p className="text-muted-foreground">{cs.notes}</p> : null}
                {cs.approved_by_name ? <p className="text-xs text-muted-foreground">Approved by {cs.approved_by_name} on {formatDate(cs.approved_at)}</p> : null}
              </CardContent>
            </Card>
          ) : null}
          {prices ? (
            <Card>
              <CardHeader><CardTitle>Your agreed prices</CardTitle></CardHeader>
              <CardContent>
                {(tiers ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No agreed price yet — reorders will be quoted by your account manager.</p> : (
                  <ul className="divide-y text-sm tabular">
                    {(tiers as Array<{ quantity: number; unit_price: string; total_centavos: number; vat_inclusive: boolean; base_date: string }>).map((p) => (
                      <li key={p.quantity} className="flex justify-between py-2">
                        <span>{p.quantity.toLocaleString("en-PH")} pcs <span className="text-muted-foreground">({formatUnitPrice(p.unit_price)}/pc)</span></span>
                        <span className="font-semibold">{formatCentavos(p.total_centavos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Reorder prices are adjusted for current costs — see Phase 5.</p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
            <CardContent>
              {(history ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Not ordered yet.</p> : (
                <ul className="divide-y text-sm">
                  {(history as unknown as Array<{ quantity: number; orders: { order_no: string; placed_at: string } }>).map((h) => (
                    <li key={h.orders.order_no} className="flex justify-between py-2"><span>{h.orders.order_no} · {formatDate(h.orders.placed_at)}</span><span className="tabular">{h.quantity.toLocaleString("en-PH")} pcs</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
