import { PartyForm } from "@/components/forms/party-form";
import { PageHeader } from "@/components/ui";
import { requireEditor } from "@/server/session";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireEditor();
  return (
    <>
      <PageHeader title="New client" />
      <div className="max-w-3xl"><PartyForm kind="client" /></div>
    </>
  );
}
