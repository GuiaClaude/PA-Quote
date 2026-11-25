import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Link2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { signPreviews } from "@/lib/data/previews";
import { loadCategoriesAndProducts } from "@/lib/data/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterChips } from "@/components/data/filter-chips";
import { ItemForm } from "@/components/items/item-form";
import { VersionPanel, NewVersionButton, type VersionView } from "@/components/items/version-panel";
import { ColorStandardForm } from "@/components/items/color-standard-form";
import { PreviewViewer } from "@/components/files/preview-viewer";
import { ItemPrices } from "@/components/pricing/item-prices";
import { manilaToday } from "@/lib/dates";
import { FileUploader } from "@/components/files/file-uploader";
import { formatDate, formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

type FileRow = {
  id: string; kind: string; label: string | null; original_name: string | null; external_url: string | null; size_bytes: number | null;
  sha256: string | null; created_at: string; deleted_at: string | null; copied_to_archive_at: string | null;
  preview_renditions: { id: string; page_no: number; side: string | null; preview_path: string | null; width: number | null; height: number | null; status: string; error: string | null; source: string }[];
};

export default async function StaffItemDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireStaff();
  const canManage = me.staffRole !== "pa_production";
  const tab = ["artwork", "specs", "color", "history"].includes(sp.tab ?? "") ? sp.tab! : "artwork";
  const sb = await supabaseServer();

  const { data: item } = await sb.from("print_items")
    .select(`id, name, code, tags, spec, organization_id, category_id, product_id, approved_version_id, organizations(name), product_categories(name),
      artwork_versions!artwork_versions_print_item_id_fkey(id, version_no, status, change_notes, created_at, approved_at, is_locked,
        uploader:profiles!artwork_versions_uploaded_by_fkey(full_name), approver:profiles!artwork_versions_approved_by_fkey(full_name),
        files(id, kind, label, original_name, external_url, size_bytes, sha256, created_at, deleted_at, copied_to_archive_at,
          preview_renditions(id, page_no, side, preview_path, width, height, status, error, source)))`)
    .eq("id", id).maybeSingle();
  if (!item) notFound();

  const versions = ((item.artwork_versions as unknown as Array<{
    id: string; version_no: number; status: string; change_notes: string | null; created_at: string; approved_at: string | null; is_locked: boolean;
    uploader: { full_name: string } | null; approver: { full_name: string } | null; files: FileRow[];
  }>) ?? []).sort((a, b) => b.version_no - a.version_no);

  const allPaths = versions.flatMap((v) => v.files.flatMap((f) => f.preview_renditions.map((r) => r.preview_path)));
  const urls = await signPreviews(sb, allPaths);
  const maxMb = (await getSetting("uploads")).max_file_mb;
  const org = item.organizations as unknown as { name: string };

  const views: VersionView[] = versions.map((v) => ({
    id: v.id, versionNo: v.version_no, status: v.status, notes: v.change_notes, createdAt: v.created_at, approvedAt: v.approved_at,
    uploadedBy: v.uploader?.full_name ?? null, approvedBy: v.approver?.full_name ?? null,
    files: v.files.filter((f) => !f.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((f) => ({
      id: f.id, kind: f.kind, name: f.original_name ?? f.label ?? "File", url: f.external_url, size: f.size_bytes, sha256: f.sha256,
      copiedAt: f.copied_to_archive_at,
      pages: f.preview_renditions.sort((a, b) => a.page_no - b.page_no).map((r) => ({
        id: r.id, pageNo: r.page_no, side: r.side, status: r.status, error: r.error, source: r.source,
        url: r.preview_path ? urls[r.preview_path] ?? null : null, width: r.width, height: r.height,
      })),
    })),
  }));
  const approved = views.find((v) => v.status === "approved");
  const driveOnly = approved && approved.files.length > 0 && approved.files.some((f) => f.kind === "drive_link" && !f.copiedAt) && !approved.files.some((f) => f.kind === "upload");

  return (
    <>
      <Link href="/staff/items" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Print Items</Link>
      <PageHeader title={item.name as string}
        breadcrumb={<Link className="hover:underline" href={`/staff/clients/${item.organization_id}`}>{org.name}</Link>}
        description={[(item.product_categories as unknown as { name: string } | null)?.name, item.code].filter(Boolean).join(" · ")}
        actions={<>
          {approved ? <Badge tone="success">{t.items.approved} · v{approved.versionNo}</Badge> : <Badge tone="warning">No approved version</Badge>}
          {canManage && approved ? <Button asChild size="sm" variant="outline"><Link href={`/staff/items/${id}/template`}><Type />Editable fields</Link></Button> : null}
        </>} />
      {sp.created ? <Alert tone="success" className="mb-4">Print Item created. Upload its files below, then press <b>Approve for Print</b>.</Alert> : null}
      {driveOnly ? <Alert tone="danger" className="mb-4"><b>{t.items.driveOnly}</b> Upload a copy into the archive, then press “Mark as copied”.</Alert> : null}
      <div className="mb-5"><FilterChips base={`/staff/items/${id}`} param="tab" active={tab === "artwork" ? "" : tab}
        options={[{ value: "", label: "Artwork & versions" }, { value: "specs", label: "Specs" }, { value: "color", label: "Colour standard" }, { value: "history", label: "Prices & history" }]} /></div>

      {tab === "artwork" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            {canManage ? <div className="flex justify-end"><NewVersionButton printItemId={id} /></div> : null}
            {views.map((v) => (
              <VersionPanel key={v.id} version={v} canManage={canManage} organizationId={item.organization_id as string} printItemId={id} maxMb={maxMb} />
            ))}
          </div>
          <Card className="h-fit xl:sticky xl:top-20">
            <CardHeader><CardTitle>What the client sees</CardTitle></CardHeader>
            <CardContent>
              {approved ? <PreviewViewer pages={approved.files.flatMap((f) => f.pages.filter((p) => p.url && p.status === "ready").map((p) => ({ id: p.id, url: p.url!, width: p.width ?? 1200, height: p.height ?? 800, pageNo: p.pageNo, side: p.side, fileName: f.name })))} compact />
                : <p className="text-sm text-muted-foreground">Nothing yet — clients see the low-res preview of the approved version.</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "specs" ? <SpecsTab item={item as unknown as SpecItem} canManage={canManage} /> : null}
      {tab === "color" ? <ColorTab printItemId={id} organizationId={item.organization_id as string} canManage={canManage} maxMb={maxMb} /> : null}
      {tab === "history" ? <HistoryTab printItemId={id} prices={canManage} /> : null}
    </>
  );
}

type SpecItem = { id: string; name: string; code: string | null; tags: string[]; category_id: string | null; product_id: string | null; spec: Record<string, unknown> };

async function SpecsTab({ item, canManage }: { item: SpecItem; canManage: boolean }) {
  const catalog = await loadCategoriesAndProducts();
  const s = item.spec as { size?: string; material?: string; gsm?: number | null; colors?: string; finishing?: string[]; packaging?: string; notes?: string };
  return (
    <Card className="max-w-3xl"><CardContent className="pt-5">
      {canManage ? (
        <ItemForm {...catalog} values={{
          id: item.id, name: item.name, code: item.code ?? "", categoryId: item.category_id ?? "", productId: item.product_id ?? "", tags: (item.tags ?? []).join(", "),
          size: s.size ?? "", material: s.material ?? "", gsm: s.gsm ? String(s.gsm) : "", colors: s.colors ?? "", finishing: (s.finishing ?? []).join(", "), packaging: s.packaging ?? "", notes: s.notes ?? "",
        }} />
      ) : <pre className="text-sm">{JSON.stringify(item.spec, null, 2)}</pre>}
    </CardContent></Card>
  );
}

async function ColorTab({ printItemId, organizationId, canManage, maxMb }: { printItemId: string; organizationId: string; canManage: boolean; maxMb: number }) {
  const sb = await supabaseServer();
  const { data: cs } = await sb.from("color_standards")
    .select("id, pantone_refs, cmyk_targets, paper_stock, press_machine, notes, approved_by_name, approved_at, color_standard_photos(id, files(id, original_name, preview_renditions(id, preview_path, width, height, status)))")
    .eq("print_item_id", printItemId).is("deleted_at", null).maybeSingle();
  const photos = ((cs?.color_standard_photos as unknown as Array<{ id: string; files: { id: string; original_name: string; preview_renditions: { id: string; preview_path: string | null; width: number; height: number; status: string }[] } }>) ?? []);
  const urls = await signPreviews(sb, photos.flatMap((p) => p.files.preview_renditions.map((r) => r.preview_path)));
  const cmyk = Object.entries((cs?.cmyk_targets as Record<string, { c: number; m: number; y: number; k: number }>) ?? {}).map(([k, v]) => `${k}: ${v.c} ${v.m} ${v.y} ${v.k}`).join("\n");
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Approved colour standard</CardTitle></CardHeader><CardContent>
        <ColorStandardForm disabled={!canManage} values={{
          printItemId, pantone: ((cs?.pantone_refs as string[]) ?? []).join(", "), cmyk, paperStock: (cs?.paper_stock as string) ?? "", pressMachine: (cs?.press_machine as string) ?? "",
          notes: (cs?.notes as string) ?? "", approvedByName: (cs?.approved_by_name as string) ?? "", approvedAt: cs?.approved_at ? String(cs.approved_at).slice(0, 10) : "",
        }} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Press sheet / proof photos</CardTitle></CardHeader><CardContent className="space-y-4">
        {photos.length ? (
          <PreviewViewer compact pages={photos.flatMap((p) => p.files.preview_renditions.filter((r) => r.preview_path && urls[r.preview_path]).map((r) => ({ id: r.id, url: urls[r.preview_path!]!, width: r.width, height: r.height, pageNo: 1, side: null, fileName: p.files.original_name })))} />
        ) : <p className="text-sm text-muted-foreground">No photos yet.</p>}
        {canManage ? (cs ? <FileUploader organizationId={organizationId} printItemId={printItemId} purpose="color_standard_photo" maxMb={maxMb} label="Add photos or scans of the approved press sheet" hint="JPG, PNG or TIFF" />
          : <p className="text-sm text-muted-foreground">Save the colour standard first, then add photos.</p>) : null}
      </CardContent></Card>
    </div>
  );
}

async function HistoryTab({ printItemId, prices }: { printItemId: string; prices: boolean }) {
  const sb = await supabaseServer();
  const [{ data: tiers }, { data: orders }, { data: approvals }, { data: quotes }] = await Promise.all([
    prices ? sb.from("price_tiers").select("quantity, unit_price, total_centavos, vat_inclusive, source, source_ref, base_date").eq("print_item_id", printItemId).eq("is_current", true).order("quantity") : Promise.resolve({ data: [] }),
    sb.from("order_items").select("id, quantity, orders(id, order_no, placed_at, status)").eq("print_item_id", printItemId).limit(50),
    sb.from("approvals").select("id, approved_by_name, approved_at, ip, artwork_versions!inner(version_no, print_item_id)").eq("artwork_versions.print_item_id", printItemId).order("approved_at", { ascending: false }),
    prices ? sb.from("instant_quotes").select("id, quantity, final_total_centavos, status, block_reasons, created_at, valid_until, override_reason").eq("print_item_id", printItemId).order("created_at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {prices ? (
        <div className="xl:col-span-2"><ItemPrices printItemId={printItemId} today={manilaToday()}
          tiers={(tiers as Array<{ quantity: number; unit_price: string; total_centavos: number; source: string; source_ref: string | null; base_date: string; vat_inclusive: boolean }>).map((p) => ({ quantity: p.quantity, unitPrice: String(p.unit_price), totalCentavos: Number(p.total_centavos), vatInclusive: p.vat_inclusive, source: p.source, sourceRef: p.source_ref, baseDate: p.base_date }))}
          quotes={((quotes ?? []) as Array<{ id: string; quantity: number; final_total_centavos: number | null; status: string; block_reasons: string[] | null; created_at: string; valid_until: string; override_reason: string | null }>).map((q) => ({ id: q.id, quantity: q.quantity, totalCentavos: q.final_total_centavos === null ? null : Number(q.final_total_centavos), status: q.status, reasons: q.block_reasons ?? [], createdAt: q.created_at, validUntil: q.valid_until, overrideReason: q.override_reason }))} /></div>
      ) : null}
      <Card><CardHeader><CardTitle>Order history</CardTitle></CardHeader><CardContent>
        {(orders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Not ordered yet.</p> : (
          <ul className="divide-y text-sm">{(orders as unknown as Array<{ id: string; quantity: number; orders: { id: string; order_no: string; placed_at: string } }>).map((o) => (
            <li key={o.id} className="flex justify-between py-2"><Link className="text-primary hover:underline" href={`/staff/orders/${o.orders.id}`}>{o.orders.order_no}</Link><span>{formatDate(o.orders.placed_at)} · {o.quantity.toLocaleString("en-PH")} pcs</span></li>
          ))}</ul>
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Approvals</CardTitle></CardHeader><CardContent>
        {(approvals ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No approvals recorded.</p> : (
          <ul className="divide-y text-sm">{(approvals as unknown as Array<{ id: string; approved_by_name: string; approved_at: string; ip: string | null; artwork_versions: { version_no: number } }>).map((a) => (
            <li key={a.id} className="py-2"><p className="font-medium">v{a.artwork_versions.version_no} · {a.approved_by_name}</p><p className="text-xs text-muted-foreground">{formatDateTime(a.approved_at)}{a.ip ? ` · ${a.ip}` : ""}</p></li>
          ))}</ul>
        )}
      </CardContent></Card>
      <p className="text-xs text-muted-foreground xl:col-span-2"><Link2 className="mr-1 inline size-3" />Every change to this item is also in the audit log.</p>
    </div>
  );
}
