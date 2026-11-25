import { lookupInvite } from "@/lib/auth/invites";
import { AcceptInviteForm } from "./accept-form";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";
import { t } from "@/i18n";

export const metadata = { title: t.invite.title };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await lookupInvite(token);
  if (invite.state !== "ok") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{t.invite.title}</h1>
        <Alert tone="warning">{invite.state === "expired" ? t.invite.expired : t.invite.invalid}</Alert>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">{t.auth.backToSignIn}</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.invite.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{invite.company ? t.invite.intro(invite.company) : t.invite.staffIntro}</p>
      </div>
      <AcceptInviteForm token={token} email={invite.email} />
    </div>
  );
}
