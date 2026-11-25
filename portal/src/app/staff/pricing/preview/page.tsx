import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { QuotePreviewTool } from "@/components/pricing/quote-preview-tool";

export const metadata = { title: "Quote preview" };

export default async function QuotePreviewPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: items } = await sb.from("print_items").select("id, name, code, organization_id, organizations(name), price_tiers(quantity, is_current)").is("deleted_at", null).order("name");
  const list = (items ?? []).map((i) => ({
    id: i.id as string, name: i.name as string, code: i.code as string | null, organizationId: i.organization_id as string, client: (i.organizations as unknown as { name: string }).name,
    tiers: ((i.price_tiers as { quantity: number; is_current: boolean }[]) ?? []).filter((t) => t.is_current).map((t) => t.quantity).sort((a, b) => a - b),
  }));
  return (
    <>
      <Link href="/staff/pricing" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Pricing rules</Link>
      <PageHeader title="Quote preview" description="See exactly what a client's instant reorder quote would be today — with the full breakdown — before they see it. Nothing is saved." />
      <QuotePreviewTool items={list} initialItem={sp.item ?? null} />
    </>
  );
}
