"use client";
import { useActionState, useState, useTransition } from "react";
import { MailPlus, RotateCcw, ShieldAlert, UserX, UserCheck, X, CheckCircle2 } from "lucide-react";
import { inviteClientUser, inviteAction, userAccessAction, changeRoleAction } from "@/lib/actions/team";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { CLIENT_ROLES } from "@/lib/auth/roles";
import { formatDate, formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

export type TeamMember = {
  profileId: string; fullName: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null; isMe: boolean;
};
export type PendingInvite = { id: string; email: string; role: string; status: string; expiresAt: string; sendCount: number };

export function TeamPanel({ organizationId, members, invites, canApprove, domains }: {
  organizationId: string; members: TeamMember[]; invites: PendingInvite[]; canApprove: boolean; domains: string[];
}) {
  const [inviteState, inviteFormAction] = useActionState<ActionState, FormData>(inviteClientUser, undefined);
  const [result, setResult] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => setResult(await fn()));
  const activeAdmins = members.filter((m) => m.isActive && m.role === "client_admin").length;

  return (
    <div className="space-y-6">
      {activeAdmins === 0 ? <Alert tone="warning">{t.clients.noAdminWarning}</Alert> : null}
      {result?.error ? <Alert tone="danger">{result.error}</Alert> : null}
      {result?.message ? <Alert tone="success">{result.message}</Alert> : null}

      <Card>
        <CardHeader><CardTitle>{t.team.title}</CardTitle><CardDescription>{t.team.intro}</CardDescription></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y" aria-busy={pending}>
            {members.map((m) => (
              <li key={m.profileId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.fullName} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.fullName}{m.isMe ? <span className="text-muted-foreground"> (you)</span> : null}</p>
                    <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                    <p className="text-xs text-muted-foreground">{t.team.lastLogin}: {m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t.team.never}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!m.isActive ? <Badge tone="danger">Deactivated</Badge> : null}
                  <Select aria-label={`Role for ${m.fullName}`} value={m.role} disabled={m.isMe || !m.isActive || pending}
                    onChange={(e) => run(() => changeRoleAction(m.profileId, e.target.value))} className="h-9 w-auto min-w-40">
                    {CLIENT_ROLES.map((r) => <option key={r} value={r}>{t.team.roles[r]}</option>)}
                  </Select>
                  {m.isMe ? null : m.isActive ? (
                    <ConfirmButton size="sm" variant="outline" title={t.team.deactivate} message={t.team.deactivateConfirm(m.fullName)}
                      confirmLabel={t.team.deactivate} onConfirm={() => run(() => userAccessAction("deactivate", m.profileId))}>
                      <UserX /> {t.team.deactivate}
                    </ConfirmButton>
                  ) : (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => userAccessAction("reactivate", m.profileId))}>
                      <UserCheck /> {t.team.reactivate}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MailPlus className="size-4" />{t.team.invite}</CardTitle>
          {domains.length ? <CardDescription>Approved email domains: {domains.map((d) => `@${d}`).join(", ")}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <form action={inviteFormAction} className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <input type="hidden" name="organizationId" value={organizationId} />
            <div className="space-y-2"><Label htmlFor="inv-email">{t.team.inviteEmail}</Label><Input id="inv-email" name="email" type="email" required /></div>
            <div className="space-y-2">
              <Label htmlFor="inv-role">{t.team.role}</Label>
              <Select id="inv-role" name="clientRole" defaultValue="client_buyer">
                {CLIENT_ROLES.map((r) => <option key={r} value={r}>{t.team.roles[r]}</option>)}
              </Select>
            </div>
            <SubmitButton>{t.team.sendInvite}</SubmitButton>
          </form>
          <ul className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
            {CLIENT_ROLES.map((r) => <li key={r}><b className="text-foreground">{t.team.roles[r]}:</b> {t.team.roleHelp[r]}</li>)}
          </ul>
          {inviteState?.error ? <Alert tone="danger" className="mt-4">{inviteState.error}</Alert> : null}
          {inviteState?.message ? <Alert tone="success" className="mt-4">{inviteState.message}</Alert> : null}
        </CardContent>
      </Card>

      {invites.length ? (
        <Card>
          <CardHeader><CardTitle>{t.team.pending}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">{t.team.roles[i.role as keyof typeof t.team.roles] ?? i.role} · expires {formatDate(i.expiresAt)} · sent {i.sendCount}×</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {i.status === "needs_approval" ? <Badge tone="warning"><ShieldAlert />{t.clients.needsApproval}</Badge> : <Badge tone="info">Pending</Badge>}
                    {i.status === "needs_approval" && canApprove ? (
                      <Button size="sm" disabled={pending} onClick={() => run(() => inviteAction("approve", i.id))}><CheckCircle2 />{t.clients.approve}</Button>
                    ) : null}
                    {i.status === "pending" ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => inviteAction("resend", i.id))}><RotateCcw />{t.team.resend}</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => inviteAction("cancel", i.id))}><X />{t.team.cancel}</Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
