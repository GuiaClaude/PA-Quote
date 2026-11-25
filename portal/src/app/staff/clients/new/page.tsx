import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NewClientForm } from "./new-client-form";
import { t } from "@/i18n";

export default async function NewClientPage() {
  const me = await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data: sales } = await sb.from("profiles").select("id, full_name").in("staff_role", ["pa_sales", "pa_admin"]).eq("is_active", true).order("full_name");
  return (
    <>
      <Link href="/staff/clients" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.clients.title}</Link>
      <PageHeader title={t.clients.add} description="After saving, invite the client's main contact as Company admin." />
      <Card className="max-w-2xl"><CardContent className="pt-5">
        <NewClientForm managers={(sales ?? []).map((s) => ({ id: s.id as string, name: s.full_name as string }))} canPickManager={me.staffRole === "pa_admin"} />
      </CardContent></Card>
    </>
  );
}
