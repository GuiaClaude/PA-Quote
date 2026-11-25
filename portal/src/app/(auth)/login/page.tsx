import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.auth.signInTitle };

const reasons: Record<string, { tone: "info" | "warning" | "danger"; text: string }> = {
  timeout: { tone: "info", text: t.auth.timeout },
  deactivated: { tone: "danger", text: t.auth.deactivated },
  signedout: { tone: "info", text: t.auth.signedOut },
  password: { tone: "info", text: t.auth.passwordSaved },
  link: { tone: "warning", text: "That sign-in link has expired or was already used. Please request a new one." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const reason = sp.reason ? reasons[sp.reason] : undefined;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.auth.signInTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.auth.signInSubtitle}</p>
      </div>
      {reason ? <Alert tone={reason.tone}>{reason.text}</Alert> : null}
      <LoginForm next={sp.next} />
      <p className="text-xs leading-relaxed text-muted-foreground">{t.auth.noAccount}</p>
    </div>
  );
}
