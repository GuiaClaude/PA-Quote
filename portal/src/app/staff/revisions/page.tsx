import { PenLine } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffRevisions() {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data } = await sb.from("revision_requests")
    .select("id, round_no, status, general_notes, submitted_at, print_items(name), organizations(name), revision_markups(id)")
    .in("status", ["open", "in_prepress", "proof_sent"]).order("submitted_at").limit(100);
  const rows = (data ?? []) as unknown as Array<{ id: string; round_no: number; status: string; general_notes: string | null; submitted_at: string; print_items: { name: string } | null; organizations: { name: string } | null; revision_markups: { id: string }[] }>;
  return (
    <>
      <PageHeader title={t.nav.revisions} description="Prepress revision queue." />
      <PhaseNotice phase={3}>The markup viewer, replies to each markup and revised-proof upload arrive in Phase 3.</PhaseNotice>
      <div className="mt-4">
        {rows.length === 0 ? <EmptyState Icon={PenLine} title="No open revision requests." /> : (
          <Card><Table>
            <THead><TR><TH>Item</TH><TH>Client</TH><TH>Round</TH><TH>Markups</TH><TH>Status</TH><TH>Submitted</TH></TR></THead>
            <TBody>{rows.map((r) => (
              <TR key={r.id}>
                <TD><p className="font-semibold">{r.print_items?.name}</p>{r.general_notes ? <p className="max-w-80 truncate text-xs text-muted-foreground">{r.general_notes}</p> : null}</TD>
                <TD>{r.organizations?.name}</TD><TD>Revision {r.round_no}</TD><TD className="tabular">{r.revision_markups.length}</TD>
                <TD><Badge tone={r.status === "open" ? "warning" : "info"}>{r.status.replace(/_/g, " ")}</Badge></TD>
                <TD className="whitespace-nowrap">{formatDateTime(r.submitted_at)}</TD>
              </TR>
            ))}</TBody>
          </Table></Card>
        )}
      </div>
    </>
  );
}
