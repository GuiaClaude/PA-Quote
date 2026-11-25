"use client";
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install the app" card for phones. Android/desktop Chrome get a one-tap
 * install button; iPhone gets the two Safari steps. Hidden once installed or
 * dismissed (remembered on this device).
 */
export function InstallCard() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem("pa-install-dismissed") === "1"; } catch { /* private mode */ }
    if (standalone || dismissed) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setMode("prompt"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const timer = ios ? window.setTimeout(() => setMode("ios"), 0) : undefined;
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); if (timer) window.clearTimeout(timer); };
  }, []);

  const dismiss = () => { setMode("hidden"); try { localStorage.setItem("pa-install-dismissed", "1"); } catch { /* ignore */ } };
  if (mode === "hidden") return null;
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 p-4 sm:flex-row sm:items-center" role="region" aria-label="Install the app">
      <button type="button" onClick={dismiss} aria-label="Not now" className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-surface"><X className="size-4" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="size-12 rounded-xl" />
      <div className="flex-1 pr-6">
        <p className="font-semibold">Install the Print Amplified app</p>
        {mode === "ios" ? (
          <p className="text-sm text-muted-foreground">In Safari, tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> <b>Share</b>, then <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> <b>Add to Home Screen</b>. No app store needed.</p>
        ) : <p className="text-sm text-muted-foreground">Open it from your home screen like any app, stay signed in longer and get order updates. No app store needed.</p>}
      </div>
      {mode === "prompt" && evt ? (
        <Button onClick={async () => { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setMode("hidden"); }}><Download />Install</Button>
      ) : null}
    </div>
  );
}
