import { ProjectForm } from "@/components/forms/project-form";
import { ListFilters } from "@/components/list-filters";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Projects / CE#" };

const STATUS_TONE = { quoted: "neutral", ongoing: "brand", completed: "good", billed: "good", cancelled: "neutral" } as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status ?? "all";
  const { rows, clients } = await withUser(s, async (tx) => ({
    rows: await tx<{ id: string; ce_number: string; name: string; client: string | null; job_type: string | null; status: keyof typeof STATUS_TONE; start_date: string | null; quoted_c: number | null; billed_net: number; costs: number }[]>`
      select p.id, p.ce_number, p.name, c.name as client, p.job_type, p.status, p.start_date, p.quoted_c,
             coalesce((select sum(b.net_c) from billings b where b.project_id = p.id and b.deleted_at is null and b.status not in ('void','rejected','draft')), 0)::bigint as billed_net,
             coalesce((select sum(l.net_c) from purchase_lines l join purchases pu on pu.id = l.purchase_id where coalesce(l.project_id, pu.project_id) = p.id and pu.deleted_at is null), 0)::bigint as costs
      from projects p left join clients c on c.id = p.client_id
      where p.org_id = ${s.orgId} and p.deleted_at is null
        and (${q} = '' or p.ce_number ilike ${"%" + q + "%"} or p.name ilike ${"%" + q + "%"} or coalesce(c.name, '') ilike ${"%" + q + "%"})
        and (${status} = 'all' or p.status = ${status})
      order by p.start_date desc nulls last, p.created_at desc limit 300`,
    clients: await tx<{ id: string; name: string }[]>`select id, name from clients where org_id = ${s.orgId} and deleted_at is null order by name`,
  }));
  return (
    <>
      <PageHeader title="Projects / CE#" description="Jobs tracked by cost-estimate number. Profit = sales billed to the job − purchases charged to it." />
      {canEdit(s) && (
        <Card className="mb-4">
          <CardHeader title="Add a project" />
          <ProjectForm clients={clients} />
        </Card>
      )}
      <Card>
        <ListFilters base="/projects" active={status} q={q} tabs={[{ key: "all", label: "All" }, { key: "ongoing", label: "Ongoing" }, { key: "billed", label: "Billed" }, { key: "quoted", label: "Quoted" }]} />
        {rows.length === 0 ? <EmptyState title="No projects match" /> : (
          <Table>
            <thead><tr><Th>CE#</Th><Th>Project</Th><Th>Client</Th><Th>Started</Th><Th>Status</Th><Th align="right">Quoted</Th><Th align="right">Billed (net)</Th><Th align="right">Direct costs</Th><Th align="right">Profit</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const profit = r.billed_net - r.costs;
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <Td className="whitespace-nowrap font-medium">{r.ce_number}</Td>
                    <Td>{r.name}</Td>
                    <Td className="text-ink-2">{r.client ?? "—"}</Td>
                    <Td className="whitespace-nowrap">{r.start_date ? formatDate(r.start_date) : "—"}</Td>
                    <Td><Badge tone={STATUS_TONE[r.status]}>{r.status[0]!.toUpperCase() + r.status.slice(1)}</Badge></Td>
                    <Td align="right">{r.quoted_c ? formatPeso(r.quoted_c) : "—"}</Td>
                    <Td align="right">{formatPeso(r.billed_net)}</Td>
                    <Td align="right">{r.costs ? formatPeso(r.costs) : "—"}</Td>
                    <Td align="right" className={r.costs ? (profit >= 0 ? "font-medium text-good" : "font-medium text-bad") : "text-muted"}>{r.costs ? formatPeso(profit) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
