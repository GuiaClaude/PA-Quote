import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";
import { SecurityCard } from "@/components/account/security-card";
import { PushToggle } from "@/components/pwa/push-toggle";
import { t } from "@/i18n";

export default async function AccountPage() {
  const user = await requireClient();
  const sb = await supabaseServer();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return (
    <>
      <PageHeader title={t.account.title} description={`${t.roles[user.clientRole]}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t.account.profile}</CardTitle></CardHeader><CardContent><ProfileForm fullName={user.fullName} phone={user.phone} email={user.email} /></CardContent></Card>
        <div className="space-y-6">
          <SecurityCard mfaOn={aal?.nextLevel === "aal2"} mfaRequired={user.mfaRequired} />
          <Card><CardHeader><CardTitle>Notifications</CardTitle></CardHeader><CardContent><PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} /></CardContent></Card>
          {user.clientRole === "client_admin" ? (
            <Link href="/app/account/team" className="flex items-center gap-3 rounded-xl border bg-surface p-4 font-medium hover:bg-surface-muted">
              <UsersRound className="size-5 text-primary" /> <span className="flex-1">{t.account.team}</span> <ChevronRight className="size-4" />
            </Link>
          ) : null}
          <p className="text-xs text-muted-foreground"><Link className="underline" href="/privacy">{t.auth.privacy}</Link></p>
        </div>
      </div>
    </>
  );
}
