import Link from "next/link";
import { Layers, RefreshCcw, Search } from "lucide-react";
import { signPreviews } from "@/lib/data/previews";
import { Thumb } from "@/components/files/thumb";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";

export default async function MyItems({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireClient();
  const sp = await searchParams;
  const sb = await supabaseServer();
  let query = sb.from("print_items")
    .select("id, name, code, tags, category_id, thumbnail_path, product_categories(name), approved_version_id")
    .is("deleted_at", null).order("name").limit(60);
  const q = (sp.q ?? "").trim().slice(0, 80);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,code.ilike.%${q.replace(/[%,()]/g, "")}%`);
  if (sp.category && /^[0-9a-f-]{36}$/.test(sp.category)) query = query.eq("category_id", sp.category);
  const [{ data: items }, { data: categories }] = await Promise.all([
    query,
    sb.from("product_categories").select("id, name").order("sort"),
  ]);
  const thumbs = await signPreviews(sb, (items ?? []).map((i) => i.thumbnail_path as string | null));

  return (
    <>
      <PageHeader title={t.items.title} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t.items.search} aria-label={t.items.search} className="pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <CategoryChip href="/app/items" active={!sp.category} label={t.common.all} />
          {(categories ?? []).map((c) => (
            <CategoryChip key={c.id as string} href={`/app/items?category=${c.id}`} active={sp.category === c.id} label={c.name as string} />
          ))}
        </div>
      </form>
      {(items ?? []).length === 0 ? (
        <EmptyState Icon={Layers} title={q ? "No items match your search." : t.items.clientEmpty} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {(items ?? []).map((i) => (
            <li key={i.id as string}>
              <Card className="flex h-full flex-col overflow-hidden">
                <Link href={`/app/items/${i.id}`} className="block aspect-[4/3] overflow-hidden border-b bg-surface-muted">
                  <Thumb url={i.thumbnail_path ? thumbs[i.thumbnail_path as string] : null} alt={`Preview of ${i.name as string}`} className="size-full" />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <Link href={`/app/items/${i.id}`} className="line-clamp-2 text-sm font-semibold hover:underline">{i.name as string}</Link>
                  <div className="flex flex-wrap gap-1">
                    <Badge>{(i.product_categories as unknown as { name: string } | null)?.name ?? "Item"}</Badge>
                    {i.approved_version_id ? <Badge tone="success">{t.items.approved}</Badge> : null}
                  </div>
                  <Link href={`/app/items/${i.id}/reorder`} className="mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-soft text-sm font-semibold text-primary hover:bg-primary hover:text-white">
                    <RefreshCcw className="size-4" aria-hidden /> {t.home.reorder}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CategoryChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined}
      className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium ${active ? "border-primary bg-primary-soft text-primary" : "bg-surface hover:bg-surface-muted"}`}>
      {label}
    </Link>
  );
}
