import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { AUDIT_AREAS, auditQuery, filtersToQuery, parseAuditFilters } from "@/lib/data/audit-query";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pager } from "@/components/data/pager";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff(["pa_admin"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const f = parseAuditFilters(sp);
  const sb = await supabaseServer();
  const { data, count } = await auditQuery(sb, f, { count: true }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as unknown as Array<{ id: number; created_at: string; action: string; actor_email: string | null; entity_type: string | null; entity_id: string | null; ip: string | null; meta: Record<string, unknown>; organizations: { name: string } | null }>;
  const qs = filtersToQuery(f);

  return (
    <>
      <PageHeader title={t.nav.audit} description="Every sign-in (including failed ones), invite, deactivation, upload, preview view, download, revision, approval, price change, payment and deletion. Entries can never be edited or deleted."
        actions={<Button asChild variant="outline"><a href={`/staff/audit/export${qs ? `?${qs}` : ""}`}><Download />Export CSV</a></Button>} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_auto] lg:items-end" role="search">
          <div className="space-y-1"><Label htmlFor="au-area" className="text-xs">Area</Label>
            <Select id="au-area" name="area" defaultValue={f.area ?? ""}><option value="">{t.common.all}</option>{AUDIT_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></div>
          <div className="space-y-1"><Label htmlFor="au-who" className="text-xs">Person (email)</Label><Input id="au-who" name="who" defaultValue={f.who ?? ""} placeholder="e.g. liza@" /></div>
          <div className="space-y-1"><Label htmlFor="au-from" className="text-xs">From</Label><Input id="au-from" name="from" type="date" defaultValue={f.from ?? ""} /></div>
          <div className="space-y-1"><Label htmlFor="au-to" className="text-xs">To</Label><Input id="au-to" name="to" type="date" defaultValue={f.to ?? ""} /></div>
          <div className="flex gap-2"><Button type="submit">Filter</Button>{qs ? <Button asChild variant="ghost"><Link href="/staff/audit">Clear</Link></Button> : null}</div>
        </form>
      </Card>
      <p className="mb-2 text-sm text-muted-foreground">{(count ?? 0).toLocaleString("en-PH")} entr{count === 1 ? "y" : "ies"}</p>
      {rows.length === 0 ? <EmptyState Icon={ScrollText} title="No entries match these filters." /> : (
        <Card><Table>
          <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH className="hidden md:table-cell">Company</TH><TH className="hidden lg:table-cell">Details</TH></TR></THead>
          <TBody>{rows.map((r) => (
            <TR key={r.id}>
              <TD className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</TD>
              <TD className="max-w-48 truncate text-sm">{r.actor_email ?? "System"}</TD>
              <TD><Badge tone={/fail|lock|deactivated|voided|removed|cancelled/.test(r.action) ? "danger" : "neutral"}>{r.action}</Badge></TD>
              <TD className="hidden md:table-cell">{r.organizations?.name ?? "—"}</TD>
              <TD className="hidden max-w-96 truncate font-mono text-xs text-muted-foreground lg:table-cell" title={JSON.stringify(r.meta)}>{r.ip ? `${r.ip} · ` : ""}{JSON.stringify(r.meta)}</TD>
            </TR>
          ))}</TBody>
        </Table></Card>
      )}
      <Pager page={page} total={count ?? 0} size={PAGE} base={`/staff/audit${qs ? `?${qs}` : ""}`} />
    </>
  );
}
