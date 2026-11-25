import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Palette, PenLine, RefreshCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { signPreviews } from "@/lib/data/previews";
import { audit } from "@/lib/audit";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecList } from "@/components/data/spec-list";
import { PreviewViewer, type ViewerPage } from "@/components/files/preview-viewer";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function ItemDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirmed?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClient();
  const prices = canSeePrices(user);
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items")
    .select("id, name, code, spec, tags, approved_version_id, product_categories(name), color_standards!print_items_color_standard_fk(id, pantone_refs, cmyk_targets, paper_stock, press_machine, notes, approved_by_name, approved_at)")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();

  // Previews of the APPROVED version only. Clients can read preview rows but
  // never the high-res file rows (database rules), so we go through renditions.
  const [{ data: version }, { data: renditions }, { data: tiers }, { data: history }, { data: org }] = await Promise.all([
    item.approved_version_id ? sb.from("artwork_versions").select("version_no, approved_at").eq("id", item.approved_version_id).maybeSingle() : Promise.resolve({ data: null }),
    item.approved_version_id
      ? sb.from("preview_renditions").select("id, file_id, page_no, side, preview_path, width, height, status, created_at").eq("status", "ready")
          .in("file_id", (await approvedFileIds(item.approved_version_id as string)))
      : Promise.resolve({ data: [] }),
    prices ? sb.from("price_tiers").select("quantity, unit_price, total_centavos, vat_inclusive, base_date").eq("print_item_id", id).eq("is_current", true).order("quantity") : Promise.resolve({ data: [] }),
    sb.from("order_items").select("id, quantity, orders(id, order_no, placed_at)").eq("print_item_id", id).limit(20),
    sb.from("organizations").select("allow_highres_download").eq("id", user.organizationId).single(),
  ]);
  const { data: openRevision } = await sb.from("revision_requests").select("id, round_no, status")
    .eq("print_item_id", id).in("status", ["open", "in_prepress", "proof_sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const rows = (renditions ?? []) as Array<{ id: string; file_id: string; page_no: number; side: string | null; preview_path: string; width: number; height: number; created_at: string }>;
  const urls = await signPreviews(sb, rows.map((r) => r.preview_path));
  const pages: ViewerPage[] = rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.page_no - b.page_no)
    .filter((r) => urls[r.preview_path])
    .map((r) => ({ id: r.id, url: urls[r.preview_path]!, width: r.width, height: r.height, pageNo: r.page_no, side: r.side, fileName: "Artwork" }));

  const cs = item.color_standards as unknown as { id: string; pantone_refs: string[]; cmyk_targets: Record<string, { c: number; m: number; y: number; k: number }>; paper_stock: string | null; press_machine: string | null; notes: string | null; approved_by_name: string | null; approved_at: string | null } | null;
  const { data: csPhotos } = cs ? await sb.from("color_standard_photos").select("id, files(preview_renditions(id, preview_path, width, height, status))").eq("color_standard_id", cs.id) : { data: [] };
  const photoRows = ((csPhotos ?? []) as unknown as Array<{ id: string; files: { preview_renditions: { id: string; preview_path: string | null; width: number; height: number; status: string }[] } | null }>)
    .flatMap((p) => p.files?.preview_renditions ?? []).filter((r) => r.status === "ready" && r.preview_path);
  const photoUrls = await signPreviews(sb, photoRows.map((r) => r.preview_path));

  await audit({ action: "preview.viewed", actorId: user.id, actorEmail: user.email, organizationId: user.organizationId, entityType: "print_item", entityId: id });

  return (
    <>
      <Link href="/app/items" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.items.title}</Link>
      <PageHeader title={item.name as string} description={[(item.product_categories as unknown as { name: string } | null)?.name, item.code].filter(Boolean).join(" · ")}
        actions={<>
          {version ? <Badge tone="success">{t.items.approved} · v{version.version_no as number}</Badge> : null}
          {user.clientRole !== "client_viewer" && version ? <Button asChild variant="outline"><Link href={`/app/items/${id}/review`}><PenLine />Review artwork</Link></Button> : null}
          {user.clientRole !== "client_viewer" ? <Button asChild><Link href={`/app/items/${id}?reorder=1`}><RefreshCcw />{t.home.reorder}</Link></Button> : null}
        </>} />
      {sp.confirmed ? <Alert tone="success" className="mb-4">Thanks — you confirmed the artwork is still correct. One-tap reorder with an instant quote arrives in Phase 5.</Alert> : null}
      {openRevision ? (
        <Alert tone={openRevision.status === "proof_sent" ? "warning" : "info"} className="mb-4">
          {openRevision.status === "proof_sent" ? <><b>Your revised proof is ready.</b> Please review and approve it. </> : <>Revision {openRevision.round_no as number} is with Print Amplified prepress. </>}
          <Link className="font-semibold text-primary underline" href={`/app/revisions/${openRevision.id}`}>Open revision</Link>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Approved artwork</CardTitle>
            {version?.approved_at ? <span className="text-xs text-muted-foreground">Approved {formatDate(version.approved_at as string)}</span> : null}
          </CardHeader>
          <CardContent>
            <PreviewViewer pages={pages} />
            {org?.allow_highres_download && pages.length ? <HighResLinks versionId={item.approved_version_id as string} /> : null}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Specifications</CardTitle></CardHeader><CardContent><SpecList spec={item.spec as Record<string, unknown>} /></CardContent></Card>
          {cs ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-4" />Colour standard</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {cs.pantone_refs?.length ? <div className="flex flex-wrap gap-1">{cs.pantone_refs.map((p) => <Badge key={p} tone="brand">{p}</Badge>)}</div> : null}
                {Object.keys(cs.cmyk_targets ?? {}).length ? (
                  <ul className="space-y-1 tabular">{Object.entries(cs.cmyk_targets).map(([k, v]) => <li key={k}><b>{k}</b>: C{v.c} M{v.m} Y{v.y} K{v.k}</li>)}</ul>
                ) : null}
                {cs.paper_stock ? <p>Paper: {cs.paper_stock}</p> : null}
                {cs.press_machine ? <p>Press: {cs.press_machine}</p> : null}
                {cs.notes ? <p className="text-muted-foreground">{cs.notes}</p> : null}
                {cs.approved_by_name ? <p className="text-xs text-muted-foreground">Approved by {cs.approved_by_name} on {formatDate(cs.approved_at)}</p> : null}
                {photoRows.length ? <PreviewViewer compact pages={photoRows.map((r) => ({ id: r.id, url: photoUrls[r.preview_path!]!, width: r.width, height: r.height, pageNo: 1, side: null, fileName: "Press sheet" }))} /> : null}
              </CardContent>
            </Card>
          ) : null}
          {prices ? (
            <Card>
              <CardHeader><CardTitle>Your agreed prices</CardTitle></CardHeader>
              <CardContent>
                {(tiers ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No agreed price yet — reorders will be quoted by your account manager.</p> : (
                  <ul className="divide-y text-sm tabular">
                    {(tiers as Array<{ quantity: number; unit_price: string; total_centavos: number }>).map((p) => (
                      <li key={p.quantity} className="flex justify-between py-2"><span>{p.quantity.toLocaleString("en-PH")} pcs <span className="text-muted-foreground">({formatUnitPrice(p.unit_price)}/pc)</span></span><span className="font-semibold">{formatCentavos(p.total_centavos)}</span></li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
            <CardContent>
              {(history ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Not ordered yet.</p> : (
                <ul className="divide-y text-sm">
                  {(history as unknown as Array<{ id: string; quantity: number; orders: { id: string; order_no: string; placed_at: string } }>).map((h) => (
                    <li key={h.id} className="flex justify-between py-2"><Link className="text-primary hover:underline" href={`/app/orders/${h.orders.id}`}>{h.orders.order_no}</Link><span>{formatDate(h.orders.placed_at)} · <span className="tabular">{h.quantity.toLocaleString("en-PH")} pcs</span></span></li>
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

/** Ids of the approved version's files, read with admin rights because clients can't read file rows. */
async function approvedFileIds(versionId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data } = await supabaseAdmin().from("files").select("id").eq("artwork_version_id", versionId).is("deleted_at", null);
  return (data ?? []).map((f) => f.id as string);
}

/** Only shown when management allowed high-res downloads for this client. */
async function HighResLinks({ versionId }: { versionId: string }) {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data } = await supabaseAdmin().from("files").select("id, original_name").eq("artwork_version_id", versionId).eq("kind", "upload").is("deleted_at", null);
  if (!data?.length) return null;
  return (
    <div className="mt-4 rounded-lg border bg-surface-muted p-3 text-sm">
      <p className="mb-2 font-medium">Print files (high resolution)</p>
      <ul className="space-y-1">{data.map((f) => (
        <li key={f.id as string}><a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/files/${f.id}/download`}><Download className="size-4" />{f.original_name as string}</a></li>
      ))}</ul>
    </div>
  );
}
