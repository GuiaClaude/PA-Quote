"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile security check (free, privacy-friendly CAPTCHA).
 * Puts the token in a hidden "captchaToken" field. Supabase Auth verifies
 * it when CAPTCHA protection is switched on in the Supabase dashboard.
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (local development) it renders nothing.
 */
export function Turnstile({ resetKey }: { resetKey?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey || !ready || !box.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(""),
      appearance: "interaction-only",
    });
  }, [siteKey, ready]);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      setToken("");
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} />
      <div ref={box} className="min-h-[1px]" />
      <input type="hidden" name="captchaToken" value={token} />
    </>
  );
}
