import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileQuestion } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { signPreviews } from "@/lib/data/previews";
import { autofillAvailable } from "@/lib/pricing/autofill";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewViewer } from "@/components/files/preview-viewer";
import { EstimateEditor, type EstimateValues } from "@/components/estimates/estimate-editor";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Past estimate" };

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: e } = await sb.from("past_estimates")
    .select(`id, organization_id, print_item_id, estimate_no, estimate_date, vat_inclusive, valid_until, notes, status, extracted_by, confirmed_at, organizations(name),
      files!past_estimates_original_file_id_fkey(id, original_name, bucket, storage_path, preview_renditions(id, page_no, side, preview_path, width, height, status)),
      past_estimate_lines(quantity, unit_price, total_centavos, spec), past_estimate_charges(label, amount_centavos, recharge_on_reorder)`)
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!e) notFound();
  const file = e.files as unknown as { id: string; original_name: string; bucket: string; storage_path: string; preview_renditions: { id: string; page_no: number; side: string | null; preview_path: string | null; width: number | null; height: number | null; status: string }[] } | null;
  const [{ data: items }, urls, original, aiOn] = await Promise.all([
    sb.from("print_items").select("id, name, code, spec").eq("organization_id", e.organization_id).is("deleted_at", null).order("name"),
    signPreviews(sb, file?.preview_renditions.map((r) => r.preview_path) ?? []),
    file ? sb.storage.from(file.bucket).createSignedUrl(file.storage_path, 300, { download: file.original_name }) : Promise.resolve({ data: null }),
    autofillAvailable(),
  ]);
  const pages = (file?.preview_renditions ?? []).filter((r) => r.status === "ready" && r.preview_path && urls[r.preview_path]).sort((a, b) => a.page_no - b.page_no)
    .map((r) => ({ id: r.id, url: urls[r.preview_path!]!, width: r.width ?? 1200, height: r.height ?? 1600, pageNo: r.page_no, side: r.side, fileName: file!.original_name }));
  const lines = (e.past_estimate_lines as unknown as { quantity: number; unit_price: string; total_centavos: number; spec: Record<string, unknown> }[]).sort((a, b) => a.quantity - b.quantity);
  const itemList = (items ?? []).map((i) => ({ id: i.id as string, name: `${i.name}${i.code ? ` (${i.code})` : ""}`, spec: i.spec as Record<string, unknown> }));
  const values: EstimateValues = {
    id: e.id as string, printItemId: e.print_item_id as string | null, estimateNo: (e.estimate_no as string) ?? "", estimateDate: e.estimate_date as string,
    vatInclusive: e.vat_inclusive as boolean, validUntil: (e.valid_until as string) ?? "", notes: (e.notes as string) ?? "", extractedBy: e.extracted_by as EstimateValues["extractedBy"],
    spec: lines[0]?.spec ?? itemList.find((i) => i.id === e.print_item_id)?.spec ?? {},
    lines: lines.map((l) => ({ quantity: String(l.quantity), unitPrice: Number(l.unit_price).toFixed(4), total: (Number(l.total_centavos) / 100).toFixed(2) })),
    charges: (e.past_estimate_charges as unknown as { label: string; amount_centavos: number; recharge_on_reorder: boolean }[]).map((c) => ({ label: c.label, amount: (Number(c.amount_centavos) / 100).toFixed(2), recharge: c.recharge_on_reorder })),
  };
  const confirmed = e.status === "confirmed";
  return (
    <>
      <Link href="/staff/estimates" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Past estimates</Link>
      <PageHeader title={values.estimateNo || "New past estimate"} description={(e.organizations as unknown as { name: string }).name}
        actions={confirmed ? <Badge tone="success">Confirmed {e.confirmed_at ? formatDateTime(e.confirmed_at as string) : ""}</Badge> : <Badge tone="warning">Draft — not used for prices yet</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="xl:sticky xl:top-20 xl:self-start">
          <CardHeader className="flex-row items-center justify-between gap-2"><CardTitle>Original</CardTitle>
            {original.data?.signedUrl ? <Button asChild size="sm" variant="outline"><a href={original.data.signedUrl}><Download />{file!.original_name.length > 28 ? "Download" : file!.original_name}</a></Button> : null}</CardHeader>
          <CardContent>
            {pages.length ? <PreviewViewer pages={pages} compact /> : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                <FileQuestion className="size-8" />
                {file ? (file.preview_renditions.some((r) => r.status === "pending") ? "Making the preview… refresh in a moment." : "No preview for this file type — download it to read it.") : "No file uploaded — typed in from paper."}
              </div>
            )}
          </CardContent>
        </Card>
        <EstimateEditor values={values} items={itemList} readOnly={confirmed} aiAvailable={aiOn && Boolean(file)} />
      </div>
    </>
  );
}
