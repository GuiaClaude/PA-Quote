import { JournalForm } from "@/components/forms/journal-form";
import { PageHeader } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { withUser } from "@/server/db";
import { requireEditor } from "@/server/session";

export const metadata = { title: "Manual journal entry" };

export default async function NewJournalPage() {
  const s = await requireEditor();
  const accounts = await withUser(s, (tx) => tx<{ code: string; name: string; type: string }[]>`select code, name, type from accounts where org_id = ${s.orgId} and is_active order by code`);
  return (
    <>
      <PageHeader title="Manual journal entry" />
      <JournalForm accounts={accounts} today={manilaToday()} />
    </>
  );
}
