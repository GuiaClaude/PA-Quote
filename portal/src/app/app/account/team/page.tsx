import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { loadTeam } from "@/lib/data/team";
import { PageHeader } from "@/components/layout/page-header";
import { TeamPanel } from "@/components/account/team-panel";
import { t } from "@/i18n";

export default async function TeamPage() {
  const user = await requireClient(["client_admin"]);
  const { team, pending, domains } = await loadTeam(user.organizationId, user.id);
  return (
    <>
      <Link href="/app/account" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.account.title}</Link>
      <PageHeader title={t.team.title} />
      <TeamPanel organizationId={user.organizationId} members={team} invites={pending} canApprove={false} domains={domains} />
    </>
  );
}
