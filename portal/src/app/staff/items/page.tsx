import Link from "next/link";
import { Layers, Link2, Plus, Upload } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { signPreviews } from "@/lib/data/previews";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Thumb } from "@/components/files/thumb";
import { FilterChips } from "@/components/data/filter-chips";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffItems({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[%,()]/g, "").slice(0, 60);
  const sb = await supabaseServer();
  let query = sb.from("print_items")
    .select("id, name, code, updated_at, thumbnail_path, approved_version_id, organizations(name), product_categories(name), artwork_versions!artwork_versions_print_item_id_fkey(status, files(kind, copied_to_archive_at, deleted_at))")
    .is("deleted_at", null).order("updated_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  if (sp.filter === "unapproved") query = query.is("approved_version_id", null);
  const { data } = await query;
  let rows = (data ?? []) as unknown as Array<{ id: string; name: string; code: string | null; updated_at: string; thumbnail_path: string | null; organizations: { name: string } | null; product_categories: { name: string } | null; artwork_versions: { status: string; files: { kind: string; copied_to_archive_at: string | null; deleted_at: string | null }[] }[] }>;
  const driveOnly = (r: (typeof rows)[number]) => {
    const files = r.artwork_versions.find((v) => v.status === "approved")?.files.filter((f) => !f.deleted_at) ?? [];
    return files.length > 0 && !files.some((f) => f.kind === "upload");
  };
  if (sp.filter === "drive") rows = rows.filter(driveOnly);
  const urls = await signPreviews(sb, rows.map((r) => r.thumbnail_path));
  const canManage = me.staffRole !== "pa_production";

  return (
    <>
      <PageHeader title={t.items.staffTitle} actions={canManage ? <>
        <Button asChild variant="outline"><Link href="/staff/import"><Upload />Import CSV</Link></Button>
        <Button asChild><Link href="/staff/items/new"><Plus />New Print Item</Link></Button>
      </> : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips base="/staff/items" param="filter" active={sp.filter} options={[{ value: "", label: t.common.all }, { value: "unapproved", label: "No approved version" }, { value: "drive", label: "Drive link only" }]} />
        <form role="search"><input name="q" defaultValue={q} placeholder="Search items" aria-label="Search items" className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm sm:w-64" /></form>
      </div>
      {rows.length === 0 ? <EmptyState Icon={Layers} title={q || sp.filter ? "No items match." : t.items.empty} action={canManage ? <Button asChild><Link href="/staff/items/new"><Plus />New Print Item</Link></Button> : undefined} /> : (
        <Card><Table>
          <THead><TR><TH className="w-16"><span className="sr-only">Preview</span></TH><TH>Item</TH><TH>Client</TH><TH className="hidden md:table-cell">Category</TH><TH>Artwork</TH><TH className="hidden lg:table-cell">Updated</TH></TR></THead>
          <TBody>{rows.map((r) => {
            const approved = r.artwork_versions.some((v) => v.status === "approved");
            return (
              <TR key={r.id}>
                <TD><Link href={`/staff/items/${r.id}`}><Thumb url={r.thumbnail_path ? urls[r.thumbnail_path] : null} alt="" className="size-12 rounded-md border" /></Link></TD>
                <TD><Link href={`/staff/items/${r.id}`} className="font-semibold text-primary hover:underline">{r.name}</Link><p className="text-xs text-muted-foreground">{r.code}</p></TD>
                <TD>{r.organizations?.name}</TD>
                <TD className="hidden md:table-cell">{r.product_categories?.name}</TD>
                <TD className="space-x-1">
                  {approved ? <Badge tone="success">{t.items.approved}</Badge> : <Badge tone="warning">No approved version</Badge>}
                  {driveOnly(r) ? <Badge tone="danger" title={t.items.driveOnly}><Link2 />Drive link only</Badge> : null}
                </TD>
                <TD className="hidden lg:table-cell">{formatDate(r.updated_at)}</TD>
              </TR>
            );
          })}</TBody>
        </Table></Card>
      )}
    </>
  );
}
