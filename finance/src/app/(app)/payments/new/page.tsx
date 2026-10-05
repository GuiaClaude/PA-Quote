import { PaymentForm } from "@/components/forms/payment-form";
import { PageHeader } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { withUser } from "@/server/db";
import { requireEditor } from "@/server/session";

export const metadata = { title: "Pay bills" };

export default async function NewPaymentPage() {
  const s = await requireEditor();
  const d = await withUser(s, async (tx) => ({
    suppliers: await tx<{ id: string; name: string }[]>`select id, name from suppliers where org_id = ${s.orgId} and deleted_at is null order by name`,
    banks: await tx<{ id: string; name: string }[]>`select id, name from bank_accounts where org_id = ${s.orgId} and is_active order by case type when 'current' then 1 when 'savings' then 2 when 'ewallet' then 3 else 4 end, name`,
  }));
  return (
    <>
      <PageHeader title="Pay bills" description="Record a payment to a supplier and apply it to their bills." />
      <PaymentForm {...d} today={manilaToday()} />
    </>
  );
}
