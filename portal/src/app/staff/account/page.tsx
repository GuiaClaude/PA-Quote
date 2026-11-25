import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";
import { SecurityCard } from "@/components/account/security-card";
import { PushToggle } from "@/components/pwa/push-toggle";
import { t } from "@/i18n";

export default async function StaffAccount() {
  const user = await requireStaff();
  const sb = await supabaseServer();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return (
    <>
      <PageHeader title={t.account.title} description={t.roles[user.staffRole]} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t.account.profile}</CardTitle></CardHeader><CardContent><ProfileForm fullName={user.fullName} phone={user.phone} email={user.email} /></CardContent></Card>
        <SecurityCard mfaOn={aal?.nextLevel === "aal2"} mfaRequired={user.mfaRequired} />
          <Card><CardHeader><CardTitle>Notifications</CardTitle></CardHeader><CardContent><PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} /></CardContent></Card>
      </div>
    </>
  );
}
