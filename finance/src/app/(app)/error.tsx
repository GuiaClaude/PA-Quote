"use client";

import Link from "next/link";
import { Card, Notice } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const readOnly = /can only read/i.test(error.message);
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-[18px] font-semibold">{readOnly ? "Read-only access" : "Something went wrong"}</h1>
      <div className="mt-3">
        <Notice tone={readOnly ? "warn" : "bad"}>
          {readOnly ? "Your role (Viewer) can see reports and records but can't add or change them. Ask the Owner if you need Bookkeeper access." : "This page couldn't load. Your data is safe: nothing was changed."}
        </Notice>
      </div>
      <div className="mt-4 flex gap-3 text-[13px] font-medium">
        <Link href="/dashboard" className="text-brand-strong hover:underline">Back to dashboard</Link>
        {!readOnly && <button onClick={reset} className="text-brand-strong hover:underline">Try again</button>}
      </div>
      {error.digest && <p className="mt-4 text-[11px] text-muted">Reference: {error.digest}</p>}
    </Card>
  );
}
