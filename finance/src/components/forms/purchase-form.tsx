"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { addDays, formatDate } from "@/lib/domain/dates";
import { splitVatInclusive, withholdingOnNet } from "@/lib/domain/money";
import { createPurchaseAction } from "@/server/actions/purchases";
import { FormError, peso, pesoValue, useSubmit } from "./common";

type Supplier = { id: string; name: string; terms_days: number; vat_status: string; ewt_rate_bp: number; default_category_id: string | null };
type Category = { id: string; name: string; expense_type: string };

export function PurchaseForm({ suppliers, categories, projects, today }: { suppliers: Supplier[]; categories: Category[]; projects: { id: string; ce_number: string; name: string }[]; today: string }) {
  const [supplierId, setSupplierId] = useState("");
  const [docType, setDocType] = useState("sales_invoice");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(today);
  const [terms, setTerms] = useState("30");
  const [vat, setVat] = useState("vat");
  const [noReceipt, setNoReceipt] = useState(false);
  const [ewt, setEwt] = useState("0");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [approval, setApproval] = useState("approved_in_process");
  const [lines, setLines] = useState([{ categoryId: "", description: "", gross: "" }]);
  const { submit, error, pending } = useSubmit(() => "/purchases");

  const pick = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (!s) return;
    setTerms(String(s.terms_days));
    setVat(s.vat_status === "vat" ? "vat" : "non_vat");
    setEwt(String(s.ewt_rate_bp));
    if (s.default_category_id) setLines(lines.map((l, i) => (i === 0 && !l.categoryId ? { ...l, categoryId: s.default_category_id! } : l)));
  };

  const t = useMemo(() => {
    const claim = vat === "vat" && !noReceipt;
    let total = 0, net = 0, input = 0;
    for (const l of lines) {
      const g = pesoValue(l.gross);
      const sp = claim ? splitVatInclusive(g) : { net: g, vat: 0 };
      total += g; net += sp.net; input += sp.vat;
    }
    const ewtAmt = withholdingOnNet(net, Number(ewt) || 0);
    return { total, net, input, ewt: ewtAmt, payable: total - ewtAmt };
  }, [lines, vat, noReceipt, ewt]);

  const setLine = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const groups = [
    { label: "Direct materials (cost of sales)", t: "direct_materials" },
    { label: "Overhead – fixed", t: "overhead_fixed" },
    { label: "Overhead – non-fixed", t: "overhead_non_fixed" },
  ];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => createPurchaseAction({
          supplierId, projectId: projectId || null, docType, referenceNo: ref, invoiceDate: date, termsDays: terms, vatTreatment: vat, noReceipt,
          ewtRateBp: ewt, description, approvalStatus: approval, lines: lines.map((l) => ({ categoryId: l.categoryId, description: l.description, gross: l.gross || "0" })),
        }));
      }}
    >
      <Card>
        <CardHeader title="Bill details" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" className="sm:col-span-2">
            <Select value={supplierId} onChange={(e) => pick(e.target.value)} required>
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Document type">
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="sales_invoice">Sales invoice</option>
              <option value="official_receipt">Official receipt</option>
              <option value="collection_receipt">Collection receipt</option>
              <option value="billing_invoice">Billing invoice</option>
              <option value="cash_invoice">Cash invoice</option>
              <option value="delivery_receipt">Delivery receipt</option>
              <option value="acknowledgement">Acknowledgement</option>
              <option value="none">No document</option>
            </Select>
          </Field>
          <Field label="Reference / invoice no."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label="Invoice date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Terms (days)" hint={`Due ${formatDate(addDays(date || today, Number(terms) || 0))}`}><Input type="number" min={0} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
          <Field label="VAT">
            <Select value={vat} onChange={(e) => setVat(e.target.value)}>
              <option value="vat">VAT-registered (12% input VAT)</option>
              <option value="non_vat">Non-VAT</option>
              <option value="exempt">VAT-exempt</option>
              <option value="zero_rated">Zero-rated</option>
            </Select>
          </Field>
          <Field label="EWT we withhold">
            <Select value={ewt} onChange={(e) => setEwt(e.target.value)}>
              <option value="0">None</option><option value="100">1%</option><option value="200">2%</option><option value="500">5% (rent)</option><option value="1000">10%</option><option value="1500">15%</option>
            </Select>
          </Field>
          <Field label="Project / CE# (job cost)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None (overhead)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.ce_number} – {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Approval">
            <Select value={approval} onChange={(e) => setApproval(e.target.value)}>
              <option value="to_be_processed">To be processed</option>
              <option value="approved_in_process">Approved – in process</option>
              <option value="for_revision">For revision</option>
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
            <input type="checkbox" checked={noReceipt} onChange={(e) => setNoReceipt(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            No valid receipt (the whole amount is expense; no input VAT is claimed)
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Expense lines" description="Amounts as written on the receipt (VAT-inclusive). Split a receipt across categories if needed." />
        <div className="space-y-3 p-4">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Field label={i === 0 ? "Category" : ""} className="col-span-12 sm:col-span-4">
                <Select value={l.categoryId} onChange={(e) => setLine(i, { categoryId: e.target.value })} required>
                  <option value="">Choose…</option>
                  {groups.map((g) => (
                    <optgroup key={g.t} label={g.label}>
                      {categories.filter((c) => c.expense_type === g.t).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label={i === 0 ? "Details" : ""} className="col-span-7 sm:col-span-5"><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
              <Field label={i === 0 ? "Amount (₱)" : ""} className="col-span-4 sm:col-span-2"><Input inputMode="decimal" value={l.gross} onChange={(e) => setLine(i, { gross: e.target.value })} className="text-right" placeholder="0.00" /></Field>
              <div className="col-span-1 flex justify-end">
                <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-30" aria-label="Remove line"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setLines([...lines, { categoryId: "", description: "", gross: "" }])}><Plus size={15} /> Add line</Button>
        </div>
        <div className="grid gap-1 border-t border-line p-4 text-[13px] sm:ml-auto sm:w-80">
          <R label="Total" v={t.total} strong /><R label="Net of VAT" v={t.net} /><R label="Input VAT" v={t.input} /><R label="Less EWT" v={-t.ewt} /><R label="Amount to pay" v={t.payable} strong />
        </div>
      </Card>
      <FormError error={error} />
      <div className="flex justify-end"><Button disabled={pending || !supplierId}>{pending ? "Saving…" : "Save bill"}</Button></div>
    </form>
  );
}

function R({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold text-ink" : "text-ink-2"}`}><span>{label}</span><span className="num">{peso(v)}</span></div>;
}
