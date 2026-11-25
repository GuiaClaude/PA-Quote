"use client";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { postQuoteMessage } from "@/lib/actions/ordering";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function MessageThread({ requestId, messages, canPost, viewerIsStaff = false }: {
  requestId: string; messages: { id: string; body: string; at: string; who: string; fromStaff: boolean }[]; canPost: boolean; viewerIsStaff?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {messages.length === 0 ? <p className="text-sm text-muted-foreground">No questions yet.</p> : (
        <ul className="space-y-2">{messages.map((m) => {
          const mine = m.fromStaff === viewerIsStaff;
          return (
            <li key={m.id} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm", mine ? "ml-auto bg-primary-soft" : "bg-surface-muted")}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{m.who}{m.fromStaff ? " · Print Amplified" : ""} · {formatDateTime(m.at)}</p>
            </li>
          );
        })}</ul>
      )}
      {canPost ? (
        <div className="flex gap-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={viewerIsStaff ? "Reply to the client" : "Ask a question about this quote"} className="min-h-12" aria-label="Message" />
          <Button disabled={pending || !body.trim()} onClick={() => start(async () => { const r = await postQuoteMessage(requestId, body); if (r?.error) setError(r.error); else setBody(""); })} aria-label="Send"><Send /></Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
