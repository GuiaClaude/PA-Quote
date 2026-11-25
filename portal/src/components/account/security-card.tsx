import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { t } from "@/i18n";

export function SecurityCard({ mfaOn, mfaRequired }: { mfaOn: boolean; mfaRequired: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{t.account.security}</CardTitle></CardHeader>
      <CardContent className="divide-y">
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-3 text-sm font-medium"><ShieldCheck className="size-4 text-primary" />{t.account.mfa}</span>
          {mfaOn ? <Badge tone="success">{t.account.mfaOn}</Badge> : (
            <Button asChild size="sm" variant={mfaRequired ? "default" : "outline"}><Link href="/login/mfa?enroll=1">{t.account.mfaSetup}</Link></Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-3 text-sm font-medium"><KeyRound className="size-4 text-primary" />{t.account.changePassword}</span>
          <Button asChild size="sm" variant="outline"><Link href="/reset-password">{t.account.changePassword}</Link></Button>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-3 text-sm font-medium"><LogOut className="size-4 text-danger" />{t.account.signOutAll}</span>
          <form action="/auth/signout" method="post">
            <input type="hidden" name="scope" value="global" />
            <ConfirmSubmit title={t.account.signOutAll} message={t.account.signOutAllConfirm} confirmLabel={t.account.signOutAll} variant="outline" size="sm">
              {t.account.signOutAll}
            </ConfirmSubmit>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
