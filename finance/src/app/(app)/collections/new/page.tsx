import { CollectionForm } from "@/components/forms/collection-form";
import { PageHeader } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { withUser } from "@/server/db";
import { requireEditor } from "@/server/session";

export const metadata = { title: "Receive payment" };

export default async function NewCollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireEditor();
  const sp = await searchParams;
  const { clients, banks } = await withUser(s, async (tx) => ({
    clients: await tx<{ id: string; name: string }[]>`select id, name from clients where org_id = ${s.orgId} and deleted_at is null order by name`,
    banks: await tx<{ id: string; name: string }[]>`select id, name from bank_accounts where org_id = ${s.orgId} and is_active order by case type when 'current' then 1 when 'savings' then 2 when 'ewallet' then 3 else 4 end, name`,
  }));
  return (
    <>
      <PageHeader title="Receive payment" description="Record money received from a client and apply it to their billings." />
      <CollectionForm clients={clients} banks={banks} today={manilaToday()} initialClient={sp.client} initialBilling={sp.billing} />
    </>
  );
}
