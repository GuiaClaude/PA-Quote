import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { signCatalogPhotos } from "@/lib/data/catalog-photos";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ProductForm } from "@/components/catalog/product-form";
import { PhotoManager } from "@/components/catalog/photo-manager";
import { OptionsManager } from "@/components/catalog/options-manager";
import { StandardPrices } from "@/components/catalog/standard-prices";
import type { CatalogOption } from "@/lib/catalog/options";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const [{ data: p }, { data: cats }, { data: orgs }] = await Promise.all([
    sb.from("products").select("id, name, description, category_id, default_lead_time_text, visibility, is_active, sort, photo_paths, product_visibility(organization_id), product_options(id, kind, label, value, is_active, sort), standard_prices(id, spec, quantity, unit_price, total_centavos, vat_inclusive, valid_until, is_active)").eq("id", id).maybeSingle(),
    sb.from("product_categories").select("id, name").is("deleted_at", null).order("sort"),
    sb.from("organizations").select("id, name").is("deleted_at", null).order("name"),
  ]);
  if (!p) notFound();
  const photos = await signCatalogPhotos(sb, (p.photo_paths as string[]) ?? []);
  const options = ((p.product_options as unknown as Array<CatalogOption & { is_active: boolean; sort: number }>) ?? []).filter((o) => o.is_active).sort((a, b) => a.sort - b.sort);
  return (
    <>
      <Link href="/staff/catalog" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Catalog</Link>
      <PageHeader title={p.name as string} />
      {sp.created ? <Alert tone="success" className="mb-4">Product created. Add photos, the choices clients pick from, and standard prices.</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent>
          <ProductForm categories={(cats ?? []) as { id: string; name: string }[]} clients={(orgs ?? []) as { id: string; name: string }[]} product={{
            id, name: p.name as string, description: (p.description as string) ?? "", categoryId: p.category_id as string, leadTime: (p.default_lead_time_text as string) ?? "",
            visibility: p.visibility as "all" | "selected", isActive: p.is_active as boolean, sort: p.sort as number,
            clients: ((p.product_visibility as { organization_id: string }[]) ?? []).map((v) => v.organization_id),
          }} />
        </CardContent></Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Photos</CardTitle><CardDescription>Shown in the client catalog. The first photo is the main one.</CardDescription></CardHeader>
            <CardContent><PhotoManager productId={id} photos={((p.photo_paths as string[]) ?? []).map((path) => ({ path, url: photos[path] ?? null }))} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Choices clients pick from</CardTitle><CardDescription>Sizes, papers, colours, finishing, packaging and suggested quantities for the order form.</CardDescription></CardHeader>
            <CardContent><OptionsManager productId={id} options={options} /></CardContent></Card>
        </div>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Standard prices</CardTitle>
          <CardDescription>When a client picks exactly these specs and quantity, they see the price right away and can order without waiting for a quote.</CardDescription></CardHeader>
          <CardContent><StandardPrices productId={id} options={options} prices={(p.standard_prices as unknown as Array<{ id: string; spec: Record<string, unknown>; quantity: number; unit_price: string; total_centavos: number; vat_inclusive: boolean; valid_until: string | null; is_active: boolean }>) ?? []} /></CardContent></Card>
      </div>
    </>
  );
}
