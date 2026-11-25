"use client";
import { useActionState, useState, useTransition } from "react";
import { RotateCcw, UserCheck, UserX, X } from "lucide-react";
import { inviteStaffUser, inviteAction, userAccessAction } from "@/lib/actions/team";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { formatDate, formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

type Staff = { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null };

export function StaffUsersPanel({ staff, invites, meId }: { staff: Staff[]; invites: { id: string; email: string; role: string; expiresAt: string }[]; meId: string }) {
  const [inviteState, inviteForm] = useActionState<ActionState, FormData>(inviteStaffUser, undefined);
  const [result, setResult] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => setResult(await fn()));
  const roleLabel = (r: string) => t.roles[r as keyof typeof t.roles] ?? r;

  return (
    <div className="space-y-6">
      {result?.error ? <Alert tone="danger">{result.error}</Alert> : null}
      {result?.message ? <Alert tone="success">{result.message}</Alert> : null}
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">{staff.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={s.name} />
                <div className="min-w-0"><p className="truncate font-medium">{s.name}{s.id === meId ? <span className="text-muted-foreground"> (you)</span> : null}</p>
                  <p className="truncate text-sm text-muted-foreground">{s.email}</p>
                  <p className="text-xs text-muted-foreground">{t.team.lastLogin}: {s.lastLoginAt ? formatDateTime(s.lastLoginAt) : t.team.never}</p></div></div>
              <div className="flex items-center gap-2">
                <Badge tone="brand">{roleLabel(s.role)}</Badge>
                {!s.isActive ? <Badge tone="danger">Deactivated</Badge> : null}
                {s.id === meId ? null : s.isActive ? (
                  <ConfirmButton size="sm" variant="outline" title={t.team.deactivate} message={t.team.deactivateConfirm(s.name)} confirmLabel={t.team.deactivate}
                    onConfirm={() => run(() => userAccessAction("deactivate", s.id))}><UserX />{t.team.deactivate}</ConfirmButton>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => userAccessAction("reactivate", s.id))}><UserCheck />{t.team.reactivate}</Button>
                )}
              </div>
            </li>
          ))}</ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t.staffUsers.invite}</CardTitle></CardHeader>
        <CardContent>
          <form action={inviteForm} className="grid gap-4 sm:grid-cols-[1fr_240px_auto] sm:items-end">
            <div className="space-y-2"><Label htmlFor="s-email">{t.team.inviteEmail}</Label><Input id="s-email" name="email" type="email" required /></div>
            <div className="space-y-2"><Label htmlFor="s-role">{t.team.role}</Label>
              <Select id="s-role" name="staffRole" defaultValue="pa_sales">{STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select></div>
            <SubmitButton>{t.team.sendInvite}</SubmitButton>
          </form>
          {inviteState?.error ? <Alert tone="danger" className="mt-4">{inviteState.error}</Alert> : null}
          {inviteState?.message ? <Alert tone="success" className="mt-4">{inviteState.message}</Alert> : null}
          {invites.length ? (
            <ul className="mt-5 divide-y border-t">{invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="flex-1">{i.email} · {roleLabel(i.role)} · expires {formatDate(i.expiresAt)}</span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => inviteAction("resend", i.id))}><RotateCcw />{t.team.resend}</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => inviteAction("cancel", i.id))}><X />{t.team.cancel}</Button>
              </li>
            ))}</ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
