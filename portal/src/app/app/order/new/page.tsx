import Link from "next/link";
import { FileClock, ShoppingBag } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { signCatalogPhotos } from "@/lib/data/catalog-photos";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Thumb } from "@/components/files/thumb";
import { DraftList } from "@/components/ordering/draft-list";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export const metadata = { title: "New order" };

export default async function NewOrder() {
  const user = await requireClient();
  const sb = await supabaseServer();
  const [{ data: cats }, { data: drafts }] = await Promise.all([
    sb.from("product_categories").select("id, name, description, products(id, name, description, default_lead_time_text, photo_paths, sort, standard_prices(total_centavos, is_active))").eq("is_active", true).order("sort"),
    sb.from("draft_orders").select("id, title, updated_at, payload").is("deleted_at", null).order("updated_at", { ascending: false }).limit(10),
  ]);
  const categories = ((cats ?? []) as unknown as Array<{ id: string; name: string; description: string | null; products: Array<{ id: string; name: string; description: string | null; default_lead_time_text: string | null; photo_paths: string[]; sort: number; standard_prices: { total_centavos: number; is_active: boolean }[] }> }>)
    .filter((c) => c.products.length);
  const photos = await signCatalogPhotos(sb, categories.flatMap((c) => c.products.map((p) => p.photo_paths[0] ?? "")));
  const prices = canSeePrices(user);

  return (
    <>
      <PageHeader title={t.home.newOrder} description="Pick a product. Items with a standard price can be ordered right away; for everything else we'll send you a quote." />
      {(drafts ?? []).length ? (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileClock className="size-4" />Your saved drafts</h2>
          <DraftList drafts={(drafts ?? []).map((d) => ({ id: d.id as string, title: (d.title as string) || "Draft order", updated: formatDate(d.updated_at as string), productId: ((d.payload as Record<string, unknown>)?.productId as string) ?? "" }))} />
        </section>
      ) : null}
      {categories.length === 0 ? <EmptyState Icon={ShoppingBag} title="The catalog is being prepared." description="Ask your account manager for a quote in the meantime." /> : null}
      <div className="space-y-8">
        {categories.map((c) => (
          <section key={c.id} aria-labelledby={`cat-${c.id}`}>
            <h2 id={`cat-${c.id}`} className="text-lg font-semibold">{c.name}</h2>
            {c.description ? <p className="mb-3 text-sm text-muted-foreground">{c.description}</p> : <div className="mb-3" />}
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {c.products.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((p) => {
                const from = p.standard_prices.filter((s) => s.is_active).map((s) => Number(s.total_centavos)).sort((a, b) => a - b)[0];
                return (
                  <li key={p.id}>
                    <Link href={`/app/order/new/${p.id}`} className="group block h-full">
                      <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-primary/40 group-hover:shadow-md">
                        <Thumb url={p.photo_paths[0] ? photos[p.photo_paths[0]] : null} alt="" className="aspect-[4/3] w-full border-b" />
                        <div className="flex flex-1 flex-col gap-1 p-3">
                          <p className="font-semibold leading-tight">{p.name}</p>
                          {p.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p> : null}
                          <div className="mt-auto flex items-end justify-between gap-2 pt-2 text-xs">
                            <span className="text-muted-foreground">{p.default_lead_time_text}</span>
                            {prices && from ? <span className="font-semibold text-primary">from {formatCentavos(from)}</span> : <span className="font-medium text-accent">Quote</span>}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
