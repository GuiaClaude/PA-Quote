"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { recordMfa } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

type Stage =
  | { kind: "loading" }
  | { kind: "enrol"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

export function MfaForm({ home, required }: { home: string; required: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data, error: listErr } = await sb.auth.mfa.listFactors();
      if (listErr) return setStage({ kind: "error", message: t.auth.genericError });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setStage({ kind: "verify", factorId: verified.id });
      // remove half-finished enrolments, then start a fresh one
      for (const f of data.all.filter((f) => f.status === "unverified")) await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error: enErr } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
      if (enErr || !en) return setStage({ kind: "error", message: t.auth.genericError });
      setStage({ kind: "enrol", factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "enrol" && stage.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const { error: vErr } = await sb.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.replace(/\s/g, "") });
    if (vErr) {
      setBusy(false);
      setError(t.mfa.wrongCode);
      await recordMfa("failed");
      return;
    }
    await recordMfa(stage.kind === "enrol" ? "enrolled" : "verified");
    router.replace(home);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span>
        <h1 className="text-2xl font-bold tracking-tight">{stage.kind === "enrol" ? t.mfa.enrolTitle : t.mfa.title}</h1>
      </div>
      {!required ? <p className="text-sm text-muted-foreground">{t.mfa.optionalNote}</p> : null}
      {stage.kind === "loading" ? <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /> : null}
      {stage.kind === "error" ? <Alert tone="danger">{stage.message}</Alert> : null}
      {stage.kind === "enrol" ? (
        <div className="space-y-3 text-sm">
          <p>{t.mfa.enrolIntro}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="QR code for your authenticator app" className="mx-auto size-48 rounded-lg border bg-white p-2" />
          <p className="text-muted-foreground">{t.mfa.cantScan}</p>
          <code className="block break-all rounded-md bg-surface-muted p-2 text-center font-mono text-sm">{stage.secret}</code>
        </div>
      ) : null}
      {stage.kind === "verify" ? <p className="text-sm">{t.mfa.verifyIntro}</p> : null}
      {stage.kind === "enrol" || stage.kind === "verify" ? (
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="space-y-2">
            <Label htmlFor="code">{t.mfa.code}</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
              value={code} onChange={(e) => setCode(e.target.value)} required autoFocus className="text-center text-lg tracking-[0.4em]" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.replace(/\s/g, "").length !== 6}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? t.mfa.verifying : t.mfa.verify}
          </Button>
        </form>
      ) : null}
      <form action="/auth/signout" method="post"><button className="w-full text-center text-sm text-muted-foreground hover:underline">{t.nav.signOut}</button></form>
    </div>
  );
}
