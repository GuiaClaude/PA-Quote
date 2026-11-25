import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canOrder } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/dates";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { CartView } from "@/components/reorder/cart-view";

export const metadata = { title: "Reorder cart" };

export default async function CartPage() {
  const user = await requireClient();
  if (!canOrder(user.clientRole)) redirect("/app");
  const sb = await supabaseServer();
  const { data: draft } = await sb.from("draft_orders").select("id, payload").eq("kind", "reorder_cart").eq("created_by", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lines = ((draft?.payload as { lines?: { printItemId: string; quantity: number; instantQuoteId: string }[] })?.lines) ?? [];
  const [{ data: quotes }, { data: items }, { data: addresses }] = await Promise.all([
    lines.length ? sb.from("instant_quotes").select("id, final_total_centavos, vat_centavos, valid_until, status").in("id", lines.map((l) => l.instantQuoteId)) : Promise.resolve({ data: [] }),
    lines.length ? sb.from("print_items").select("id, name, code").in("id", lines.map((l) => l.printItemId)) : Promise.resolve({ data: [] }),
    sb.from("addresses").select("id, label, line1, city, is_default").is("deleted_at", null).order("is_default", { ascending: false }),
  ]);
  const today = manilaToday();
  const rows = lines.map((l) => {
    const q = (quotes ?? []).find((x) => x.id === l.instantQuoteId);
    const it = (items ?? []).find((x) => x.id === l.printItemId);
    return { printItemId: l.printItemId, name: (it?.name as string) ?? "Print Item", code: (it?.code as string | null) ?? null, quantity: l.quantity,
      totalCentavos: q ? Number(q.final_total_centavos) : null, vatCentavos: q ? Number(q.vat_centavos) : null,
      validUntil: (q?.valid_until as string) ?? today, stale: !q || q.status !== "offered" || (q.valid_until as string) < today };
  });
  return (
    <>
      <PageHeader title="Reorder cart" description="Reorder several items in one order. Prices are at today's rates." />
      {rows.length === 0 ? (
        <EmptyState Icon={ShoppingCart} title="Your cart is empty." description="Open a Print Item and press Reorder, then “Add to cart”."
          action={<Button asChild><Link href="/app/items">Browse my Print Items</Link></Button>} />
      ) : <CartView rows={rows} addresses={(addresses ?? []).map((a) => ({ id: a.id as string, label: a.label as string, line: `${a.line1}, ${a.city}`, isDefault: a.is_default as boolean }))} />}
    </>
  );
}
