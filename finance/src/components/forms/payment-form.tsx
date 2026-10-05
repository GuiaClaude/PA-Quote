"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { createApPaymentAction, openBillsForSupplier } from "@/server/actions/purchases";
import { FormError, peso, pesoPlain, pesoValue, useSubmit } from "./common";

type Bill = Awaited<ReturnType<typeof openBillsForSupplier>>[number];

export function PaymentForm({ suppliers, banks, today }: { suppliers: { id: string; name: string }[]; banks: { id: string; name: string }[]; today: string }) {
  const [supplierId, setSupplierId] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [alloc, setAlloc] = useState<Record<string, { on: boolean; amt: string }>>({});
  const [loading, start] = useTransition();
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState("bizlink");
  const [from, setFrom] = useState(banks[0]?.id ?? "");
  const [ref, setRef] = useState("");
  const [advance, setAdvance] = useState("");
  const { submit, error, pending } = useSubmit(() => "/payments");

  useEffect(() => {
    if (!supplierId) return setBills([]);
    start(async () => {
      const rows = await openBillsForSupplier(supplierId);
      setBills(rows);
      setAlloc(Object.fromEntries(rows.map((b) => [b.id, { on: false, amt: "" }])));
    });
  }, [supplierId]);

  const total = useMemo(() => bills.reduce((a, b) => a + (alloc[b.id]?.on ? pesoValue(alloc[b.id]!.amt) : 0), 0) + pesoValue(advance), [alloc, bills, advance]);
  const pickMode = (m: string) => {
    setMode(m);
    const want = m.includes("spenmo") ? "Spenmo" : m === "cash" ? "Cash" : m === "gcash_reimbursement" ? "GCash" : "BPI Current";
    const b = banks.find((x) => x.name.startsWith(want));
    if (b) setFrom(b.id);
  };

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      submit(() => createApPaymentAction({
        supplierId, paymentDate: date, paymentMode: mode, paidFromAccountId: from, referenceNo: ref, remarks: null, advance: advance || "0",
        allocations: bills.filter((b) => alloc[b.id]?.on).map((b) => ({ purchaseId: b.id, applied: alloc[b.id]!.amt || "0" })),
      }));
    }}>
      <Card>
        <CardHeader title="Payment details" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" className="sm:col-span-2">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Payment date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Payment mode">
            <Select value={mode} onChange={(e) => pickMode(e.target.value)}>
              <option value="bizlink">BPI BizLink</option><option value="bank_transfer_spenmo">Bank transfer via Spenmo</option><option value="gcash_spenmo">GCash via Spenmo</option>
              <option value="cheque">Check payment</option><option value="cash">Cash</option><option value="gcash_reimbursement">GCash for reimbursement</option>
              <option value="credit_card">Credit card</option><option value="paymaya">PayMaya</option><option value="lalamove_wallet">Lalamove wallet</option><option value="project_offsetting">Project offsetting</option>
            </Select>
          </Field>
          <Field label="Paid from"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="Reference (BizLink / Spenmo / cheque no.)"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Bills being paid" />
        {!supplierId ? <EmptyState title="Choose a supplier first" /> : loading ? <EmptyState title="Loading…" /> : bills.length === 0 ? <EmptyState title="No unpaid bills for this supplier" /> : (
          <Table>
            <thead><tr><Th /><Th>Ref #</Th><Th>Invoice date</Th><Th>Due</Th><Th align="right">Balance</Th><Th align="right">Paying</Th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className={alloc[b.id]?.on ? "bg-brand-soft/30" : ""}>
                  <Td><input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={!!alloc[b.id]?.on} onChange={(e) => setAlloc({ ...alloc, [b.id]: { on: e.target.checked, amt: e.target.checked ? pesoPlain(b.balance_c) : "" } })} aria-label={`Pay ${b.reference_no ?? "bill"}`} /></Td>
                  <Td className="font-medium">{b.reference_no ?? "—"}</Td>
                  <Td>{formatDate(b.invoice_date)}</Td>
                  <Td>{formatDate(b.due_date)}</Td>
                  <Td align="right">{peso(b.balance_c)}</Td>
                  <Td align="right"><Input disabled={!alloc[b.id]?.on} value={alloc[b.id]?.amt ?? ""} onChange={(e) => setAlloc({ ...alloc, [b.id]: { on: true, amt: e.target.value } })} className="w-32 text-right" inputMode="decimal" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line p-4">
          <Field label="Advance (not for a specific bill)" className="w-56"><Input value={advance} onChange={(e) => setAdvance(e.target.value)} className="text-right" inputMode="decimal" placeholder="0.00" /></Field>
          <p className="text-[15px] font-semibold">Total payment <span className="num ml-2">{peso(total)}</span></p>
        </div>
      </Card>
      <FormError error={error} />
      <div className="flex justify-end"><Button disabled={pending || !supplierId || total <= 0}>{pending ? "Saving…" : "Record payment"}</Button></div>
    </form>
  );
}
