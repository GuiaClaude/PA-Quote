import { BillingForm } from "@/components/forms/billing-form";
import { PageHeader } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { withUser } from "@/server/db";
import { requireEditor } from "@/server/session";

export const metadata = { title: "New billing" };

export default async function NewBillingPage() {
  const s = await requireEditor();
  const data = await withUser(s, async (tx) => {
    const clients = await tx<{ id: string; name: string; terms_days: number; cwt_rate_bp: number; vat_status: string }[]>`
      select id, name, terms_days, cwt_rate_bp, vat_status from clients where org_id = ${s.orgId} and deleted_at is null order by name`;
    const projects = await tx<{ id: string; ce_number: string; name: string; client_id: string | null }[]>`
      select id, ce_number, name, client_id from projects where org_id = ${s.orgId} and deleted_at is null and status in ('quoted','ongoing','completed') order by created_at desc limit 300`;
    const revenueAccounts = await tx<{ code: string; name: string }[]>`
      select code, name from accounts where org_id = ${s.orgId} and type = 'revenue' and is_active and coalesce(subtype, '') <> 'contra_revenue' order by code`;
    const [last] = await tx<{ doc_no: string }[]>`
      select doc_no from billings where org_id = ${s.orgId} and doc_type = 'sales_invoice' and doc_no ~ '^[0-9]+$' order by doc_no::bigint desc limit 1`;
    const next = last ? String(Number(last.doc_no) + 1).padStart(last.doc_no.length, "0") : "0001";
    return { clients, projects, revenueAccounts, next };
  });
  return (
    <>
      <PageHeader title="New billing" description="Create a sales invoice or billing statement. The journal entry is posted automatically." />
      <BillingForm clients={data.clients} projects={data.projects} revenueAccounts={data.revenueAccounts} nextDocNo={data.next} today={manilaToday()} />
    </>
  );
}
