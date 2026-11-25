import { FileText } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FilterChips } from "@/components/data/filter-chips";
import { formatDuration, formatDate, requestTimeMs } from "@/lib/dates";
import { t } from "@/i18n";

const TONE: Record<string, BadgeTone> = { submitted: "warning", quoted: "info", accepted: "success", declined: "neutral", expired: "neutral", cancelled: "neutral", draft: "neutral" };

export default async function StaffQuotes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sp = await searchParams;
  const sb = await supabaseServer();
  let q = sb.from("quote_requests").select("id, request_no, kind, title, status, submitted_at, reply_due_at, needs_quote_reasons, organizations(name)").is("deleted_at", null);
  const status = sp.status === "sent" ? "quoted" : sp.status;
  if (status && /^[a-z_]+$/.test(status)) q = q.eq("status", status);
  if (sp.needs) q = q.eq("status", "submitted").neq("needs_quote_reasons", "{}");
  const { data } = await q.order("submitted_at", { ascending: true }).limit(100);
  const rows = (data ?? []) as unknown as Array<{ id: string; request_no: string; kind: string; title: string; status: string; submitted_at: string; reply_due_at: string | null; needs_quote_reasons: string[]; organizations: { name: string } | null }>;
  const now = requestTimeMs();

  return (
    <>
      <PageHeader title={t.nav.quotes} description="Oldest first, with the target reply time." />
      <PhaseNotice phase={4}>Replying with prices per quantity tier, revising quotes and one-tap client acceptance arrive in Phase 4.</PhaseNotice>
      <div className="my-4"><FilterChips base="/staff/quotes" param="status" active={sp.status}
        options={[{ value: "", label: t.common.all }, { value: "submitted", label: "Waiting for reply" }, { value: "sent", label: "Sent" }, { value: "accepted", label: "Accepted" }, { value: "declined", label: "Declined" }]} /></div>
      {rows.length === 0 ? <EmptyState Icon={FileText} title="No quote requests here." /> : (
        <Card><Table>
          <THead><TR><TH>Request</TH><TH>Client</TH><TH>Status</TH><TH className="hidden md:table-cell">Reason</TH><TH>Waiting</TH></TR></THead>
          <TBody>{rows.map((r) => {
            const overdue = r.status === "submitted" && r.reply_due_at && new Date(r.reply_due_at).getTime() < now;
            return (
              <TR key={r.id}>
                <TD><p className="font-semibold">{r.title}</p><p className="text-xs text-muted-foreground">{r.request_no} · {r.kind === "reorder" ? "Reorder" : "New"}</p></TD>
                <TD>{r.organizations?.name}</TD>
                <TD><Badge tone={TONE[r.status] ?? "neutral"}>{r.status === "submitted" ? "Waiting for reply" : r.status}</Badge></TD>
                <TD className="hidden md:table-cell">{r.needs_quote_reasons?.length ? r.needs_quote_reasons.map((x) => <Badge key={x} tone="accent" className="mr-1">{t.staffDash.reasons[x] ?? x}</Badge>) : "—"}</TD>
                <TD className={overdue ? "font-semibold text-danger" : ""}>{r.status === "submitted" ? `${formatDuration(now - new Date(r.submitted_at).getTime())}${overdue ? " · overdue" : ""}` : formatDate(r.submitted_at)}</TD>
              </TR>
            );
          })}</TBody>
        </Table></Card>
      )}
    </>
  );
}
