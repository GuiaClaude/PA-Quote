import { PurchaseForm } from "@/components/forms/purchase-form";
import { PageHeader } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { withUser } from "@/server/db";
import { requireEditor } from "@/server/session";

export const metadata = { title: "New bill" };

export default async function NewPurchasePage() {
  const s = await requireEditor();
  const d = await withUser(s, async (tx) => ({
    suppliers: await tx<{ id: string; name: string; terms_days: number; vat_status: string; ewt_rate_bp: number; default_category_id: string | null }[]>`
      select id, name, terms_days, vat_status, ewt_rate_bp, default_category_id from suppliers where org_id = ${s.orgId} and deleted_at is null order by name`,
    categories: await tx<{ id: string; name: string; expense_type: string }[]>`select id, name, expense_type from expense_categories where org_id = ${s.orgId} and is_active order by name`,
    projects: await tx<{ id: string; ce_number: string; name: string }[]>`select id, ce_number, name from projects where org_id = ${s.orgId} and deleted_at is null and status <> 'cancelled' order by created_at desc limit 300`,
  }));
  return (
    <>
      <PageHeader title="New bill" description="Record a supplier invoice or receipt. Input VAT and the journal entry are calculated for you." />
      <PurchaseForm {...d} today={manilaToday()} />
    </>
  );
}
