"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { createManualEntryAction } from "@/server/actions/accounting";
import { FormError, peso, pesoValue, useSubmit } from "./common";

type Account = { code: string; name: string; type: string };
const blank = { account: "", debit: "", credit: "", memo: "" };

export function JournalForm({ accounts, today }: { accounts: Account[]; today: string }) {
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ ...blank }, { ...blank }]);
  const { submit, error, pending } = useSubmit((r) => `/journal/${r.id}`);
  const dr = lines.reduce((a, l) => a + pesoValue(l.debit), 0);
  const cr = lines.reduce((a, l) => a + pesoValue(l.credit), 0);
  const set = (i: number, p: Partial<typeof blank>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const types = ["asset", "liability", "equity", "revenue", "cogs", "expense", "other_income", "other_expense"];
  const label: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", cogs: "Cost of sales", expense: "Expenses", other_income: "Other income", other_expense: "Other expenses" };
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(() => createManualEntryAction({ date, memo, lines: lines.filter((l) => l.account).map((l) => ({ ...l, debit: l.debit || "0", credit: l.credit || "0" })) })); }}>
      <Card>
        <CardHeader title="Entry" description="For adjustments your accountant asks for (depreciation, accruals, corrections). Debits must equal credits." />
        <div className="grid gap-4 p-4 sm:grid-cols-4">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Description" className="sm:col-span-3"><Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Depreciation for September 2026" required /></Field>
        </div>
        <div className="space-y-2 border-t border-line p-4">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Field label={i === 0 ? "Account" : ""} className="col-span-12 sm:col-span-5">
                <Select value={l.account} onChange={(e) => set(i, { account: e.target.value })}>
                  <option value="">Choose…</option>
                  {types.map((t) => <optgroup key={t} label={label[t]}>{accounts.filter((a) => a.type === t).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>)}
                </Select>
              </Field>
              <Field label={i === 0 ? "Memo" : ""} className="col-span-12 sm:col-span-3"><Input value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} /></Field>
              <Field label={i === 0 ? "Debit" : ""} className="col-span-5 sm:col-span-2"><Input inputMode="decimal" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="text-right" /></Field>
              <Field label={i === 0 ? "Credit" : ""} className="col-span-5 sm:col-span-1"><Input inputMode="decimal" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="text-right" /></Field>
              <div className="col-span-2 flex justify-end sm:col-span-1"><button type="button" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-md p-2 text-muted hover:text-bad disabled:opacity-30" aria-label="Remove line"><Trash2 size={15} /></button></div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setLines([...lines, { ...blank }])}><Plus size={15} /> Add line</Button>
        </div>
        <div className="flex justify-end gap-6 border-t border-line p-4 text-[13px] font-semibold">
          <span>Debits <span className="num">{peso(dr)}</span></span>
          <span>Credits <span className="num">{peso(cr)}</span></span>
          <span className={dr === cr && dr > 0 ? "text-good" : "text-bad"}>{dr === cr && dr > 0 ? "Balanced" : `Difference ${peso(Math.abs(dr - cr))}`}</span>
        </div>
      </Card>
      <FormError error={error} />
      <div className="flex justify-end"><Button disabled={pending || dr !== cr || dr === 0}>{pending ? "Posting…" : "Post entry"}</Button></div>
    </form>
  );
}
