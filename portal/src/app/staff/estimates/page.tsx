import Link from "next/link";
import { FileSpreadsheet, Plus, Upload } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FilterChips } from "@/components/data/filter-chips";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Past estimates" };

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const status = (await searchParams).status;
  const sb = await supabaseServer();
  let q = sb.from("past_estimates").select("id, estimate_no, estimate_date, vat_inclusive, status, extracted_by, created_at, organizations(name), print_items(name), past_estimate_lines(quantity)").is("deleted_at", null);
  if (status === "draft" || status === "confirmed") q = q.eq("status", status);
  const { data } = await q.order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as Array<{ id: string; estimate_no: string | null; estimate_date: string; vat_inclusive: boolean; status: string; extracted_by: string; organizations: { name: string }; print_items: { name: string } | null; past_estimate_lines: { quantity: number }[] }>;
  return (
    <>
      <PageHeader title="Past estimates" description="Old cost estimates and quotations. Once confirmed, their prices become the agreed prices that instant reorder quotes start from."
        actions={<><Button asChild variant="outline"><Link href="/staff/estimates/import"><Upload />Bulk import</Link></Button><Button asChild><Link href="/staff/estimates/new"><Plus />Add estimate</Link></Button></>} />
      <div className="mb-4"><FilterChips base="/staff/estimates" param="status" active={status} options={[{ value: "", label: "All" }, { value: "draft", label: "Waiting to confirm" }, { value: "confirmed", label: "Confirmed" }]} /></div>
      {rows.length === 0 ? <EmptyState Icon={FileSpreadsheet} title="No past estimates yet." description="Upload an old estimate (PDF, Excel, Word or a scan) and confirm its prices." /> : (
        <Card><Table>
          <THead><TR><TH>Estimate</TH><TH>Client</TH><TH>Print Item</TH><TH>Quantities</TH><TH>VAT</TH><TH>Status</TH></TR></THead>
          <TBody>{rows.map((e) => (
            <TR key={e.id}>
              <TD><Link href={`/staff/estimates/${e.id}`} className="font-semibold text-primary hover:underline">{e.estimate_no || "(no number yet)"}</Link><p className="text-xs text-muted-foreground">{formatDate(e.estimate_date)}</p></TD>
              <TD>{e.organizations.name}</TD>
              <TD>{e.print_items?.name ?? <span className="text-warning">Not linked</span>}</TD>
              <TD className="tabular">{e.past_estimate_lines.map((l) => l.quantity.toLocaleString("en-PH")).join(" / ") || "—"}</TD>
              <TD><Badge>{e.vat_inclusive ? "incl." : "excl."}</Badge></TD>
              <TD className="space-x-1">{e.status === "confirmed" ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Draft</Badge>}{e.extracted_by === "ai" ? <Badge tone="info">AI-filled</Badge> : e.extracted_by === "import" ? <Badge>Imported</Badge> : null}</TD>
            </TR>
          ))}</TBody>
        </Table></Card>
      )}
    </>
  );
}
