"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Keeps an open page current: checks the organisation's data version every 15 s
 * and refreshes when anything changed. (Phase 3 swaps this for Supabase Realtime push.)
 */
export function LiveRefresh({ initialVersion, lastChange }: { initialVersion: number; lastChange: string | null }) {
  const router = useRouter();
  const version = useRef(initialVersion);
  const [updated, setUpdated] = useState(lastChange);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const v = (await res.json()) as { version: number; at: string | null };
        if (v.version !== version.current) {
          version.current = v.version;
          setUpdated(v.at);
          start(() => router.refresh());
        }
      } catch {
        /* offline: try again next tick */
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [router]);

  const time = updated
    ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(updated))
    : "—";
  return (
    <button
      onClick={() => start(() => router.refresh())}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-ink"
      title="Refresh now"
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-40" />
        <span className="relative inline-flex size-2 rounded-full bg-good" />
      </span>
      Live · last change {time}
      <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
    </button>
  );
}
