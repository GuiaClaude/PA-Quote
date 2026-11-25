import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { EstimateImport } from "@/components/estimates/estimate-import";

export const metadata = { title: "Import past estimates" };

export default async function ImportEstimatesPage() {
  await requireStaff(["pa_admin", "pa_sales"]);
  return (
    <>
      <Link href="/staff/estimates" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Past estimates</Link>
      <PageHeader title="Import past estimates" description="Load many old estimates from a spreadsheet — one row per quantity — then attach their original files." />
      <EstimateImport maxMb={(await getSetting("uploads")).max_file_mb} />
    </>
  );
}
