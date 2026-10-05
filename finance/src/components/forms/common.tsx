"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { formatPeso, parseAmount } from "@/lib/domain/money";

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

/** Submit helper: runs a server action, shows its error, then navigates on success. */
export function useSubmit(onSuccess?: (r: { id?: string; message?: string }) => string | void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fn: () => Promise<ActionResult>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const to = onSuccess?.(r);
      if (to) router.push(to);
      else router.refresh();
    });
  };
  return { submit, error, pending };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <Notice tone="bad">{error}</Notice>;
}

/** Parse what the user typed in a peso box; invalid text counts as 0 for live totals. */
export function pesoValue(text: string): number {
  try {
    return parseAmount(text) ?? 0;
  } catch {
    return 0;
  }
}

export const peso = (c: number) => formatPeso(c);
export const pesoPlain = (c: number) => formatPeso(c, { symbol: false });
