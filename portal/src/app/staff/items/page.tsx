import { Layers, Link2 } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffItems({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const q = ((await searchParams).q ?? "").replace(/[%,()]/g, "").slice(0, 60);
  const sb = await supabaseServer();
  let query = sb.from("print_items")
    .select("id, name, code, updated_at, organizations(name), product_categories(name), artwork_versions!artwork_versions_print_item_id_fkey(status, files(kind, copied_to_archive_at))")
    .is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Array<{ id: string; name: string; code: string | null; updated_at: string; organizations: { name: string } | null; product_categories: { name: string } | null; artwork_versions: { status: string; files: { kind: string; copied_to_archive_at: string | null }[] }[] }>;

  return (
    <>
      <PageHeader title={t.items.staffTitle} />
      <PhaseNotice phase={2}>Uploads, Drive links, versions, “Approved for Print”, previews and CSV import arrive in Phase 2.</PhaseNotice>
      <form role="search" className="my-4"><input name="q" defaultValue={q} placeholder="Search items" aria-label="Search items" className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm sm:w-72" /></form>
      {rows.length === 0 ? <EmptyState Icon={Layers} title={t.items.empty} /> : (
        <Card><Table>
          <THead><TR><TH>Item</TH><TH>Client</TH><TH className="hidden md:table-cell">Category</TH><TH>Artwork</TH><TH className="hidden lg:table-cell">Updated</TH></TR></THead>
          <TBody>{rows.map((r) => {
            const approved = r.artwork_versions.find((v) => v.status === "approved");
            const driveOnly = approved && approved.files.length > 0 && approved.files.every((f) => f.kind === "drive_link" && !f.copied_to_archive_at);
            return (
              <TR key={r.id}>
                <TD><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.code}</p></TD>
                <TD>{r.organizations?.name}</TD>
                <TD className="hidden md:table-cell">{r.product_categories?.name}</TD>
                <TD className="space-x-1">
                  {approved ? <Badge tone="success">{t.items.approved}</Badge> : <Badge tone="warning">No approved version</Badge>}
                  {driveOnly ? <Badge tone="danger" title={t.items.driveOnly}><Link2 />Drive link only</Badge> : null}
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
