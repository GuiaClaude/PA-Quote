"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createAccountAction, lockPeriodAction, unlockPeriodAction } from "@/server/actions/accounting";
import { FormError, useSubmit } from "./common";

export function AddAccountForm() {
  const [v, setV] = useState({ code: "", name: "", type: "expense" });
  const { submit, error, pending } = useSubmit(() => setV({ code: "", name: "", type: v.type }));
  return (
    <form className="space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); submit(() => createAccountAction(v)); }}>
      <div className="grid gap-2 sm:grid-cols-[100px_1fr_180px_auto] sm:items-end">
        <Field label="Code"><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="6295" /></Field>
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Type">
          <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
            <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option>
            <option value="cogs">Cost of sales</option><option value="expense">Expense</option><option value="other_income">Other income</option><option value="other_expense">Other expense</option>
          </Select>
        </Field>
        <Button disabled={pending}>Add account</Button>
      </div>
      <FormError error={error} />
    </form>
  );
}

export function LockPeriodForm({ suggestStart, suggestEnd }: { suggestStart: string; suggestEnd: string }) {
  const [start, setStart] = useState(suggestStart);
  const [end, setEnd] = useState(suggestEnd);
  const { submit, error, pending } = useSubmit();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (confirm("Close this period? Nobody can add or change transactions dated inside it until the Owner unlocks it.")) submit(() => lockPeriodAction(start, end)); }}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Button disabled={pending}>Close period</Button>
      </div>
      <FormError error={error} />
    </form>
  );
}

export function UnlockButton({ id }: { id: string }) {
  const { submit, error, pending } = useSubmit();
  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="secondary" disabled={pending} onClick={() => { const r = prompt("Why does this period need to be reopened? (saved in the audit log)"); if (r) submit(() => unlockPeriodAction(id, r)); }}>Unlock</Button>
      {error && <span className="mt-1 text-[12px] text-bad">{error}</span>}
    </span>
  );
}
