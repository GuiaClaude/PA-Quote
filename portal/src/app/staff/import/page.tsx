import { requireStaff } from "@/lib/auth/guards";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import old records" };

export default async function ImportPage() {
  await requireStaff(["pa_admin", "pa_sales"]);
  const maxMb = (await getSetting("uploads")).max_file_mb;
  return (
    <>
      <PageHeader title="Import old records" description="Load clients and Print Items from a spreadsheet, then upload their existing files in one go." />
      <ImportWizard maxMb={maxMb} />
    </>
  );
}
