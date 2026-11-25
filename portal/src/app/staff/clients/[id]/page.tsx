import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { loadTeam } from "@/lib/data/team";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { TeamPanel } from "@/components/account/team-panel";
import { ClientDetailsForm, DomainsCard, AccountManagerCard } from "./client-forms";
import { t } from "@/i18n";

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data: org } = await sb.from("organizations")
    .select("id, name, billing_name, tin, credit_terms, notes, allow_instant_quotes, allow_highres_download, staff_assignments(staff_profile_id, is_primary)")
    .eq("id", id).maybeSingle();
  if (!org) notFound();
  const [{ team, pending, domains }, { data: staff }] = await Promise.all([
    loadTeam(id, me.id),
    sb.from("profiles").select("id, full_name").in("staff_role", ["pa_admin", "pa_sales"]).eq("is_active", true).order("full_name"),
  ]);
  const primary = (org.staff_assignments as { staff_profile_id: string; is_primary: boolean }[]).find((s) => s.is_primary)?.staff_profile_id ?? null;

  return (
    <>
      <Link href="/staff/clients" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.clients.title}</Link>
      <PageHeader title={org.name as string} description="Company details, approved email domains, account manager and users." />
      {sp.created ? <Alert tone="success" className="mb-4">{t.clients.created} Next: invite the main contact below as <b>Company admin</b>.</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="order-2 xl:order-1">
          <TeamPanel organizationId={id} members={team} invites={pending} canApprove domains={domains} />
        </div>
        <div className="order-1 space-y-6 xl:order-2">
          <AccountManagerCard organizationId={id} current={primary} staff={(staff ?? []).map((s) => ({ id: s.id as string, name: s.full_name as string }))} canEdit={me.staffRole === "pa_admin"} />
          <DomainsCard organizationId={id} domains={domains} />
          <ClientDetailsForm isAdmin={me.staffRole === "pa_admin"} org={{
            id, name: org.name as string, billingName: (org.billing_name as string) ?? "", tin: (org.tin as string) ?? "",
            creditTerms: (org.credit_terms as string) ?? "", notes: (org.notes as string) ?? "",
            allowInstantQuotes: org.allow_instant_quotes as boolean, allowHighres: org.allow_highres_download as boolean,
          }} />
        </div>
      </div>
    </>
  );
}
