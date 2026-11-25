import { ScrollText } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FilterChips } from "@/components/data/filter-chips";
import { Pager } from "@/components/data/pager";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ area?: string; page?: string }> }) {
  await requireStaff(["pa_admin"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const area = sp.area && /^[a-z]+$/.test(sp.area) ? sp.area : undefined;
  const sb = await supabaseServer();
  let q = sb.from("audit_logs").select("id, created_at, action, actor_email, entity_type, entity_id, ip, meta, organizations(name)", { count: "exact" });
  if (area) q = q.like("action", `${area}.%`);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as unknown as Array<{ id: number; created_at: string; action: string; actor_email: string | null; entity_type: string | null; entity_id: string | null; ip: string | null; meta: Record<string, unknown>; organizations: { name: string } | null }>;

  return (
    <>
      <PageHeader title={t.nav.audit} description="Every sign-in, invite, deactivation, approval, price and settings change. Entries can never be edited or deleted." />
      <div className="mb-4"><FilterChips base="/staff/audit" param="area" active={area}
        options={[{ value: "", label: t.common.all }, { value: "auth", label: "Sign-ins" }, { value: "user", label: "Users & invites" }, { value: "client", label: "Clients" }, { value: "settings", label: "Settings" }]} /></div>
      {rows.length === 0 ? <EmptyState Icon={ScrollText} title="No entries yet." /> : (
        <Card><Table>
          <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH className="hidden md:table-cell">Company</TH><TH className="hidden lg:table-cell">Details</TH></TR></THead>
          <TBody>{rows.map((r) => (
            <TR key={r.id}>
              <TD className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</TD>
              <TD className="max-w-48 truncate text-sm">{r.actor_email ?? "System"}</TD>
              <TD><Badge tone={r.action.includes("fail") || r.action.includes("lock") || r.action.includes("deactivated") ? "danger" : "neutral"}>{r.action}</Badge></TD>
              <TD className="hidden md:table-cell">{r.organizations?.name ?? "—"}</TD>
              <TD className="hidden max-w-96 truncate font-mono text-xs text-muted-foreground lg:table-cell" title={JSON.stringify(r.meta)}>{r.ip ? `${r.ip} · ` : ""}{JSON.stringify(r.meta)}</TD>
            </TR>
          ))}</TBody>
        </Table></Card>
      )}
      <Pager page={page} total={count ?? 0} size={PAGE} base={`/staff/audit${area ? `?area=${area}` : ""}`} />
    </>
  );
}
