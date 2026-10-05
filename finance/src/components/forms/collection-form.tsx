"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { withholdingOnNet, formatRateBp } from "@/lib/domain/money";
import { DOC_SHORT } from "@/lib/labels";
import { createCollectionAction, openBillingsForClient } from "@/server/actions/sales";
import { FormError, peso, pesoPlain, pesoValue, useSubmit } from "./common";

type Client = { id: string; name: string };
type Bank = { id: string; name: string };
type OpenBilling = Awaited<ReturnType<typeof openBillingsForClient>>[number];

export function CollectionForm({ clients, banks, today, initialClient, initialBilling }: { clients: Client[]; banks: Bank[]; today: string; initialClient?: string; initialBilling?: string }) {
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [billings, setBillings] = useState<OpenBilling[]>([]);
  const [loading, startLoading] = useTransition();
  const [alloc, setAlloc] = useState<Record<string, { on: boolean; cash: string; cwt: string }>>({});
  const [date, setDate] = useState(today);
  const [receiptType, setReceiptType] = useState("collection_receipt");
  const [receiptNo, setReceiptNo] = useState("");
  const [mode, setMode] = useState("online_bank");
  const [ref, setRef] = useState("");
  const [bank, setBank] = useState(banks[0]?.id ?? "");
  const [form2307, setForm2307] = useState("pending");
  const [extra, setExtra] = useState("");
  const { submit, error, pending } = useSubmit(() => `/collections`);

  useEffect(() => {
    if (!clientId) {
      setBillings([]);
      return;
    }
    startLoading(async () => {
      const rows = await openBillingsForClient(clientId);
      setBillings(rows);
      const next: typeof alloc = {};
      for (const b of rows) {
        const on = b.id === initialBilling;
        next[b.id] = on ? fullPayment(b) : { on: false, cash: "", cwt: "" };
      }
      setAlloc(next);
    });
  }, [clientId, initialBilling]);

  const totals = useMemo(() => {
    let cash = 0, cwt = 0;
    for (const b of billings) {
      const a = alloc[b.id];
      if (!a?.on) continue;
      cash += pesoValue(a.cash);
      cwt += pesoValue(a.cwt);
    }
    return { cash, cwt, received: cash + pesoValue(extra) };
  }, [alloc, billings, extra]);

  const toggle = (b: OpenBilling, on: boolean) => setAlloc({ ...alloc, [b.id]: on ? fullPayment(b) : { on: false, cash: "", cwt: "" } });
  const edit = (id: string, patch: Partial<{ cash: string; cwt: string }>) => setAlloc({ ...alloc, [id]: { ...alloc[id]!, ...patch } });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() =>
          createCollectionAction({
            clientId, collectionDate: date, receiptType, receiptNo, paymentMode: mode, paymentReference: ref, depositAccountId: bank,
            cash: totals.received / 100, form2307Status: totals.cwt > 0 ? form2307 : "not_required", remarks: null,
            allocations: billings.filter((b) => alloc[b.id]?.on).map((b) => ({ billingId: b.id, applied: alloc[b.id]!.cash || "0", cwt: alloc[b.id]!.cwt || "0" })),
          }),
        );
      }}
    >
      <Card>
        <CardHeader title="Payment details" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client" className="sm:col-span-2">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Date received"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Payment mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="online_bank">Online bank transfer</option>
              <option value="bank_deposit">Bank deposit</option>
              <option value="cheque_pickup">Cheque pick-up</option>
              <option value="cheque_deposit">Cheque deposit</option>
              <option value="bank_wire">Bank wire</option>
              <option value="gcash">GCash</option>
              <option value="cash">Cash</option>
              <option value="offsetting">Offsetting</option>
            </Select>
          </Field>
          <Field label="Receipt type">
            <Select value={receiptType} onChange={(e) => setReceiptType(e.target.value)}>
              <option value="collection_receipt">Collection receipt</option>
              <option value="official_receipt">Official receipt (legacy)</option>
              <option value="acknowledgement_receipt">Acknowledgement receipt</option>
              <option value="sales_invoice">Sales invoice</option>
              <option value="none">None</option>
            </Select>
          </Field>
          <Field label="Receipt no."><Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} /></Field>
          <Field label="Deposited to">
            <Select value={bank} onChange={(e) => setBank(e.target.value)}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Bank / cheque reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Apply to billings" description="Tick the billings this payment covers. Partial payments are fine. CWT is filled in from the client's rate; change it to match their 2307." />
        {!clientId ? (
          <EmptyState title="Choose a client first" />
        ) : loading ? (
          <EmptyState title="Loading open billings…" />
        ) : billings.length === 0 ? (
          <EmptyState title="This client has no unpaid billings">Any amount you enter below is recorded as an advance (customer deposit).</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th /><Th>Billing</Th><Th>Due</Th><Th align="right">Balance</Th><Th align="right">Cash applied</Th><Th align="right">CWT</Th></tr></thead>
            <tbody>
              {billings.map((b) => {
                const a = alloc[b.id];
                const over = a?.on && pesoValue(a.cash) + pesoValue(a.cwt) > b.balance_c;
                return (
                  <tr key={b.id} className={a?.on ? "bg-brand-soft/30" : ""}>
                    <Td><input type="checkbox" checked={!!a?.on} onChange={(e) => toggle(b, e.target.checked)} className="size-4 accent-[var(--color-brand)]" aria-label={`Apply to ${b.doc_no}`} /></Td>
                    <Td className="whitespace-nowrap font-medium">{DOC_SHORT[b.doc_type]} {b.doc_no}<span className="ml-2 font-normal text-muted">{formatDate(b.billing_date)}</span></Td>
                    <Td className="whitespace-nowrap">{formatDate(b.due_date)}</Td>
                    <Td align="right">{peso(b.balance_c)}</Td>
                    <Td align="right"><Input disabled={!a?.on} inputMode="decimal" value={a?.cash ?? ""} onChange={(e) => edit(b.id, { cash: e.target.value })} className={`w-32 text-right ${over ? "border-bad" : ""}`} /></Td>
                    <Td align="right">
                      <Input disabled={!a?.on} inputMode="decimal" value={a?.cwt ?? ""} onChange={(e) => edit(b.id, { cwt: e.target.value })} className="w-28 text-right" />
                      {b.cwt_rate_bp > 0 && <span className="mt-0.5 block text-[11px] text-muted">{formatRateBp(b.cwt_rate_bp)} rate</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label="Extra amount not applied to a billing (advance / down payment)">
              <Input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.00" className="text-right" />
            </Field>
            {totals.cwt > 0 && (
              <Field label="BIR Form 2307 from the client">
                <Select value={form2307} onChange={(e) => setForm2307(e.target.value)}>
                  <option value="pending">Not yet received (track it)</option>
                  <option value="received">Received</option>
                  <option value="for_revision">Received, needs revision</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="space-y-1 self-end text-[13px]">
            <Line label="Cash applied to billings" value={totals.cash} />
            <Line label="Advance" value={pesoValue(extra)} />
            <Line label="Total received" value={totals.received} strong />
            <Line label="CWT withheld by client" value={totals.cwt} />
          </div>
        </div>
      </Card>

      <FormError error={error} />
      <div className="flex justify-end">
        <Button disabled={pending || !clientId || totals.received + totals.cwt <= 0}>{pending ? "Saving…" : `Record payment of ${peso(totals.received)}`}</Button>
      </div>
    </form>
  );
}

function fullPayment(b: OpenBilling) {
  // Expected CWT on what's left of the net, never more than the balance.
  const remainingCwt = Math.max(0, withholdingOnNet(b.net_c, b.cwt_rate_bp) - b.cwt_c);
  const cwt = Math.min(remainingCwt, b.balance_c);
  return { on: true, cash: pesoPlain(b.balance_c - cwt), cwt: pesoPlain(cwt) };
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-ink" : "text-ink-2"}`}>
      <span>{label}</span><span className="num">{peso(value)}</span>
    </div>
  );
}
