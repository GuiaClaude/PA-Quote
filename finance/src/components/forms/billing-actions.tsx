"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { addFollowUpNoteAction, setBillingStatusAction } from "@/server/actions/sales";
import { FormError, useSubmit } from "./common";

export function BillingStatusActions({ id, status, hasPayments }: { id: string; status: string; hasPayments: boolean }) {
  const { submit, error, pending } = useSubmit();
  const set = (st: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const reason = st === "rejected" || st === "void" ? prompt("Reason (kept in the record):") ?? undefined : undefined;
    submit(() => setBillingStatusAction(id, st, reason));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && <Button disabled={pending} onClick={() => set("billed")}>Post billing</Button>}
        {status === "billed" && <Button variant="secondary" disabled={pending} onClick={() => set("for_collection")}>Mark for collection</Button>}
        {!hasPayments && !["void", "rejected", "draft", "paid"].includes(status) && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => set("rejected", "Mark this billing as rejected by the client? Its journal entry will be reversed.")}>Rejected by client</Button>
            <Button variant="danger" disabled={pending} onClick={() => set("void", "Void this billing? Its journal entry will be reversed. The number stays in the register as void.")}>Void</Button>
          </>
        )}
        {status === "rejected" && <Button variant="secondary" disabled={pending} onClick={() => set("billed")}>Re-open</Button>}
      </div>
      <FormError error={error} />
    </div>
  );
}

export function FollowUpForm({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const { submit, error, pending } = useSubmit(() => {
    setNote("");
    setDate("");
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => addFollowUpNoteAction(id, note, date || undefined));
      }}
    >
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tumawag kay AP, i-release daw next week." />
      <div className="flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label="Next follow-up" />
        <Button disabled={pending || !note.trim()} variant="secondary">Add note</Button>
      </div>
      <FormError error={error} />
    </form>
  );
}
