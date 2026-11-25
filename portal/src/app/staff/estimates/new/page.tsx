import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { NewEstimate } from "@/components/estimates/new-estimate";

export default async function NewEstimatePage() {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const [{ data: orgs }, { data: items }] = await Promise.all([
    sb.from("organizations").select("id, name").is("deleted_at", null).order("name"),
    sb.from("print_items").select("id, name, code, organization_id").is("deleted_at", null).order("name"),
  ]);
  return (
    <>
      <Link href="/staff/estimates" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Past estimates</Link>
      <PageHeader title="Add a past estimate" description="Upload the original file (PDF, Excel, Word or a scan). You'll then check and confirm its details." />
      <NewEstimate maxMb={(await getSetting("uploads")).max_file_mb} clients={(orgs ?? []).map((o) => ({ id: o.id as string, name: o.name as string }))}
        items={(items ?? []).map((i) => ({ id: i.id as string, name: `${i.name}${i.code ? ` (${i.code})` : ""}`, organizationId: i.organization_id as string }))} />
    </>
  );
}
