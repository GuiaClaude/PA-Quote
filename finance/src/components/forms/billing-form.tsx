"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { addDays, formatDate } from "@/lib/domain/dates";
import { roundHalfUp, splitVatInclusive, withholdingOnNet, formatRateBp } from "@/lib/domain/money";
import { createBillingAction } from "@/server/actions/sales";
import { FormError, peso, pesoValue, useSubmit } from "./common";

type Client = { id: string; name: string; terms_days: number; cwt_rate_bp: number; vat_status: string };
type Project = { id: string; ce_number: string; name: string; client_id: string | null };
type Account = { code: string; name: string };

export function BillingForm({ clients, projects, revenueAccounts, nextDocNo, today }: { clients: Client[]; projects: Project[]; revenueAccounts: Account[]; nextDocNo: string; today: string }) {
  const [clientId, setClientId] = useState("");
  const client = clients.find((c) => c.id === clientId);
  const [docType, setDocType] = useState("sales_invoice");
  const [docNo, setDocNo] = useState(nextDocNo);
  const [date, setDate] = useState(today);
  const [terms, setTerms] = useState("30");
  const [projectId, setProjectId] = useState("");
  const [poNumber, setPo] = useState("");
  const [jobType, setJobType] = useState("");
  const [vat, setVat] = useState("vat");
  const [cwt, setCwt] = useState("0");
  const [status, setStatus] = useState("billed");
  const [lines, setLines] = useState([{ description: "", qty: "1", unitPrice: "", revenueAccount: "4010" }]);
  const { submit, error, pending } = useSubmit((r) => `/billings/${r.id}`);

  const pickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) {
      setTerms(String(c.terms_days));
      setCwt(String(c.cwt_rate_bp));
      setVat(c.vat_status === "vat" ? "vat" : c.vat_status);
    }
  };

  const totals = useMemo(() => {
    const gross = lines.reduce((a, l) => a + roundHalfUp((Number(l.qty) || 0) * pesoValue(l.unitPrice)), 0);
    const { net, vat: v } = vat === "vat" ? splitVatInclusive(gross) : { net: gross, vat: 0 };
    const cwtAmt = withholdingOnNet(net, Number(cwt) || 0);
    return { gross, net, vat: v, cwt: cwtAmt, expected: gross - cwtAmt };
  }, [lines, vat, cwt]);

  const clientProjects = projects.filter((p) => !clientId || p.client_id === clientId || p.client_id === null);
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() =>
          createBillingAction({
            clientId, projectId: projectId || null, docType, docNo, billingDate: date, termsDays: terms, poNumber, jobType,
            vatTreatment: vat, cwtRateBp: cwt, status,
            lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, revenueAccount: l.revenueAccount })),
          }),
        );
      }}
    >
      <Card>
        <CardHeader title="Billing details" description="Under the EOPT Act the sales invoice is the primary document for goods and services." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client" className="sm:col-span-2">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)} required>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Document type">
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="sales_invoice">Sales invoice</option>
              <option value="billing_invoice">Billing invoice</option>
              <option value="billing_statement">Billing statement</option>
              <option value="or_converted_invoice">OR converted invoice</option>
            </Select>
          </Field>
          <Field label="Document no.">
            <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} required />
          </Field>
          <Field label="Billing date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Terms (days)" hint={`Due ${formatDate(addDays(date || today, Number(terms) || 0))}`}>
            <Input type="number" min={0} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
          <Field label="Project / CE#">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.ce_number} – {p.name}</option>)}
            </Select>
          </Field>
          <Field label="PO #">
            <Input value={poNumber} onChange={(e) => setPo(e.target.value)} />
          </Field>
          <Field label="VAT">
            <Select value={vat} onChange={(e) => setVat(e.target.value)}>
              <option value="vat">VAT (12%, price includes VAT)</option>
              <option value="zero_rated">Zero-rated</option>
              <option value="exempt">VAT-exempt</option>
              <option value="non_vat">Non-VAT</option>
            </Select>
          </Field>
          <Field label="Client withholds (CWT)">
            <Select value={cwt} onChange={(e) => setCwt(e.target.value)}>
              <option value="0">None</option>
              <option value="100">1% (goods)</option>
              <option value="200">2% (services)</option>
              <option value="500">5%</option>
              {!["0", "100", "200", "500"].includes(cwt) && <option value={cwt}>{formatRateBp(Number(cwt))}</option>}
            </Select>
          </Field>
          <Field label="Job type">
            <Input value={jobType} onChange={(e) => setJobType(e.target.value)} placeholder="e.g. Brochures" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="billed">Billed (post now)</option>
              <option value="for_collection">For collection</option>
              <option value="draft">Draft (not posted)</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Lines" description="Enter VAT-inclusive prices, as written on the invoice." />
        <div className="space-y-3 p-4">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Field label={i === 0 ? "Description" : ""} className="col-span-12 sm:col-span-5">
                <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="e.g. Brochures, 1,000 pcs" required />
              </Field>
              <Field label={i === 0 ? "Qty" : ""} className="col-span-3 sm:col-span-1">
                <Input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              </Field>
              <Field label={i === 0 ? "Unit price (₱)" : ""} className="col-span-4 sm:col-span-2">
                <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} placeholder="0.00" className="text-right" />
              </Field>
              <Field label={i === 0 ? "Revenue account" : ""} className="col-span-5 sm:col-span-3">
                <Select value={l.revenueAccount} onChange={(e) => setLine(i, { revenueAccount: e.target.value })}>
                  {revenueAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </Select>
              </Field>
              <div className="col-span-12 flex items-center justify-end gap-2 sm:col-span-1">
                <span className="num text-[13px] text-ink-2 sm:hidden">{peso(roundHalfUp((Number(l.qty) || 0) * pesoValue(l.unitPrice)))}</span>
                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-30" aria-label="Remove line">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setLines([...lines, { description: "", qty: "1", unitPrice: "", revenueAccount: "4010" }])}>
            <Plus size={15} /> Add line
          </Button>
        </div>
        <div className="grid gap-1 border-t border-line p-4 text-[13px] sm:ml-auto sm:w-80">
          <Row label="Total (gross)" value={totals.gross} strong />
          <Row label="Net of VAT" value={totals.net} />
          <Row label="Output VAT" value={totals.vat} />
          <Row label={`Less CWT (${formatRateBp(Number(cwt) || 0)} of net)`} value={-totals.cwt} />
          <Row label="Expected cash" value={totals.expected} strong />
        </div>
      </Card>

      <FormError error={error} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted">{client ? `${client.name} · ${client.terms_days}-day terms` : "Saving posts the journal entry automatically."}</p>
        <Button disabled={pending || !clientId}>{pending ? "Saving…" : "Save billing"}</Button>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold text-ink" : "text-ink-2"}`}>
      <span>{label}</span>
      <span className="num">{peso(value)}</span>
    </div>
  );
}
