import Link from "next/link";
import { PenLine } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { REVISION_STATUS } from "@/lib/data/revision";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FilterChips } from "@/components/data/filter-chips";
import { formatDuration, formatDateTime, requestTimeMs } from "@/lib/dates";
import { t } from "@/i18n";

const GROUPS: Record<string, string[]> = {
  "": ["open", "in_prepress"],
  waiting: ["proof_sent"],
  done: ["approved", "changes_requested", "cancelled"],
};

export default async function StaffRevisions({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const show = (await searchParams).show ?? "";
  const sb = await supabaseServer();
  const { data } = await sb.from("revision_requests")
    .select("id, round_no, status, general_notes, submitted_at, proof_sent_at, print_items(name), organizations(name), revision_markups(id, staff_status), template_field_values(id), orders(order_no)")
    .in("status", GROUPS[show] ?? GROUPS[""]!).order("submitted_at", { ascending: show === "" }).limit(100);
  const rows = (data ?? []) as unknown as Array<{ id: string; round_no: number; status: string; general_notes: string | null; submitted_at: string; proof_sent_at: string | null; print_items: { name: string } | null; organizations: { name: string } | null; revision_markups: { id: string; staff_status: string }[]; template_field_values: { id: string }[]; orders: { order_no: string } | null }>;
  const now = requestTimeMs();

  return (
    <>
      <PageHeader title={t.nav.revisions} description="Prepress queue: client markups and edited text waiting for a revised proof. Oldest first." />
      <div className="mb-4"><FilterChips base="/staff/revisions" param="show" active={show}
        options={[{ value: "", label: "To do" }, { value: "waiting", label: "Waiting for client" }, { value: "done", label: "Closed" }]} /></div>
      {rows.length === 0 ? <EmptyState Icon={PenLine} title={show === "" ? "No revisions waiting. 🎉" : "Nothing here."} /> : (
        <Card><Table>
          <THead><TR><TH>Item</TH><TH>Client</TH><TH>Round</TH><TH className="hidden md:table-cell">Changes</TH><TH>Status</TH><TH>{show === "waiting" ? "Proof sent" : "Waiting"}</TH></TR></THead>
          <TBody>{rows.map((r) => {
            const doneCount = r.revision_markups.filter((m) => m.staff_status === "done").length;
            const waitingMs = now - new Date(r.submitted_at).getTime();
            return (
              <TR key={r.id}>
                <TD><Link href={`/staff/revisions/${r.id}`} className="font-semibold text-primary hover:underline">{r.print_items?.name}</Link>{r.orders ? <p className="text-xs text-muted-foreground">Order {r.orders.order_no}</p> : null}</TD>
                <TD>{r.organizations?.name}</TD>
                <TD>Revision {r.round_no}</TD>
                <TD className="hidden md:table-cell tabular">{r.revision_markups.length} marks{r.template_field_values.length ? ` · ${r.template_field_values.length} text` : ""}{r.revision_markups.length ? ` · ${doneCount} done` : ""}</TD>
                <TD><Badge tone={REVISION_STATUS[r.status]?.tone ?? "neutral"}>{REVISION_STATUS[r.status]?.staff ?? r.status}</Badge></TD>
                <TD className={`whitespace-nowrap ${show === "" && waitingMs > 86_400_000 ? "font-semibold text-danger" : ""}`}>
                  {show === "waiting" ? formatDateTime(r.proof_sent_at) : show === "" ? formatDuration(waitingMs) : formatDateTime(r.submitted_at)}
                </TD>
              </TR>
            );
          })}</TBody>
        </Table></Card>
      )}
    </>
  );
}
