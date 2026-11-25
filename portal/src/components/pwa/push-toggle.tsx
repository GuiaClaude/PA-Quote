"use client";
import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { subscribePush, unsubscribePush } from "@/lib/actions/push";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on" | "not-configured";

/** Turn push notifications on or off for THIS phone or computer. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      if (!publicKey) return setState("not-configured");
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, [publicKey]);

  async function turnOn() {
    setBusy(true); setMsg(null);
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "blocked" : "off"); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      const r = await subscribePush(JSON.parse(JSON.stringify(sub)));
      if (r?.error) { await sub.unsubscribe(); setMsg({ ok: false, text: r.error }); return; }
      setState("on"); setMsg({ ok: true, text: r?.message ?? "On." });
    } catch { setMsg({ ok: false, text: "Could not turn on notifications on this device." }); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setMsg(null);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) { await unsubscribePush(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    } finally { setBusy(false); }
  }

  const help: Partial<Record<State, string>> = {
    "not-configured": "Push notifications aren't set up on the server yet. You'll still get emails and in-app notices.",
    unsupported: "This browser can't show push notifications. You'll still get emails and in-app notices.",
    "ios-install": "On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), open it from there, then come back here.",
    blocked: "Notifications are blocked for this app. Allow them in your phone's or browser's settings, then come back here.",
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {state === "on" ? <BellRing className="mt-0.5 size-5 text-primary" /> : <BellOff className="mt-0.5 size-5 text-muted-foreground" />}
          <div><p className="text-sm font-medium">Notifications on this device</p>
            <p className="text-xs text-muted-foreground">Order updates, quotes ready and proofs to approve — even when the app is closed.</p></div>
        </div>
        {state === "loading" || busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" />
          : state === "on" || state === "off" ? <Switch checked={state === "on"} onCheckedChange={(v) => void (v ? turnOn() : turnOff())} aria-label="Notifications on this device" /> : null}
      </div>
      {help[state] ? <p className="rounded-lg bg-surface-muted p-3 text-xs">{help[state]}</p> : null}
      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}
    </div>
  );
}
