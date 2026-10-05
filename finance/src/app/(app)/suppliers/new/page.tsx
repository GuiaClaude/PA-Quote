import { PartyForm } from "@/components/forms/party-form";
import { PageHeader } from "@/components/ui";
import { requireEditor } from "@/server/session";

export const metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireEditor();
  return (
    <>
      <PageHeader title="New supplier" />
      <div className="max-w-3xl"><PartyForm kind="supplier" /></div>
    </>
  );
}
