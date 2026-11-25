import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { signCatalogPhotos } from "@/lib/data/catalog-photos";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Thumb } from "@/components/files/thumb";
import { CategoryEditor } from "@/components/catalog/category-editor";

export const metadata = { title: "Catalog" };

export default async function CatalogPage() {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data: cats } = await sb.from("product_categories")
    .select("id, name, description, sort, is_active, products(id, name, visibility, is_active, photo_paths, default_lead_time_text, product_options(id, is_active), standard_prices(id, is_active), product_visibility(organization_id))")
    .is("deleted_at", null).order("sort");
  const categories = (cats ?? []) as unknown as Array<{ id: string; name: string; description: string | null; sort: number; is_active: boolean;
    products: Array<{ id: string; name: string; visibility: string; is_active: boolean; photo_paths: string[]; default_lead_time_text: string | null; product_options: { is_active: boolean }[]; standard_prices: { is_active: boolean }[]; product_visibility: unknown[] }> }>;
  const photos = await signCatalogPhotos(sb, categories.flatMap((c) => c.products.map((p) => p.photo_paths[0] ?? "")));

  return (
    <>
      <PageHeader title="Catalog" description="Products clients can order. Standard prices let clients order straight away; everything else becomes a quote request."
        actions={<Button asChild><Link href="/staff/catalog/products/new"><Plus />New product</Link></Button>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {categories.length === 0 ? <EmptyState Icon={ShoppingBag} title="No categories yet — add your first one." /> : null}
          {categories.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{c.name} {!c.is_active ? <Badge className="ml-2">Hidden</Badge> : null}</CardTitle>
                <span className="text-xs text-muted-foreground">{c.products.length} product{c.products.length === 1 ? "" : "s"}</span>
              </CardHeader>
              <CardContent className="p-0">
                {c.products.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No products in this category.</p> : (
                  <ul className="divide-y">
                    {c.products.sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                      <li key={p.id}>
                        <Link href={`/staff/catalog/products/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-muted">
                          <Thumb url={p.photo_paths[0] ? photos[p.photo_paths[0]] : null} alt="" className="size-12 shrink-0 rounded-md border" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{p.name}</span>
                            <span className="block text-xs text-muted-foreground">{p.default_lead_time_text ?? "No lead time set"}</span>
                          </span>
                          <span className="hidden flex-wrap justify-end gap-1 sm:flex">
                            {!p.is_active ? <Badge>Hidden</Badge> : null}
                            {p.visibility === "selected" ? <Badge tone="accent">{p.product_visibility.length} client{p.product_visibility.length === 1 ? "" : "s"} only</Badge> : <Badge tone="info">All clients</Badge>}
                            <Badge>{p.product_options.filter((o) => o.is_active).length} options</Badge>
                            <Badge tone={p.standard_prices.some((s) => s.is_active) ? "success" : "neutral"}>{p.standard_prices.filter((s) => s.is_active).length} prices</Badge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <CategoryEditor categories={categories.map((c) => ({ id: c.id, name: c.name, description: c.description ?? "", sort: c.sort, isActive: c.is_active }))} />
      </div>
    </>
  );
}
