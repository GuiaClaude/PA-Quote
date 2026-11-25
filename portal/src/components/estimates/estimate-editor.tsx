"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { saveEstimate, confirmEstimate, autofillEstimate, createItemForEstimate } from "@/lib/actions/estimates";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Line = { quantity: string; unitPrice: string; total: string };
type Charge = { label: string; amount: string; recharge: boolean };
type SpecDraft = { size: string; material: string; gsm: string; colors: string; finishing: string; packaging: string };
export type EstimateValues = {
  id: string; printItemId: string | null; estimateNo: string; estimateDate: string; vatInclusive: boolean; validUntil: string; notes: string;
  extractedBy: "staff" | "ai" | "import"; spec: Record<string, unknown>; lines: Line[]; charges: Charge[];
};

const toDraft = (s: Record<string, unknown>): SpecDraft => ({
  size: String(s.size ?? ""), material: String(s.material ?? ""), gsm: s.gsm ? String(s.gsm) : "", colors: String(s.colors ?? ""),
  finishing: Array.isArray(s.finishing) ? (s.finishing as string[]).join(", ") : "", packaging: String(s.packaging ?? ""),
});
const fromDraft = (d: SpecDraft) => ({ size: d.size, material: d.material, gsm: d.gsm ? Number(d.gsm) : null, colors: d.colors,
  finishing: d.finishing.split(",").map((x) => x.trim()).filter(Boolean), packaging: d.packaging, notes: "" });

export function EstimateEditor({ values, items, readOnly, aiAvailable }: { values: EstimateValues; items: { id: string; name: string; spec: Record<string, unknown> }[]; readOnly: boolean; aiAvailable: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(values);
  const [spec, setSpec] = useState(toDraft(values.spec));
  const [lines, setLines] = useState<Line[]>(values.lines.length ? values.lines : [{ quantity: "", unitPrice: "", total: "" }]);
  const [charges, setCharges] = useState<Charge[]>(values.charges);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [pending, start] = useTransition();

  const payload = () => ({
    id: v.id, printItemId: v.printItemId, estimateNo: v.estimateNo, estimateDate: v.estimateDate, vatInclusive: v.vatInclusive,
    validUntil: v.validUntil || null, notes: v.notes, extractedBy: v.extractedBy, spec: fromDraft(spec),
    lines: lines.filter((l) => l.quantity.trim()).map((l) => ({ quantity: Number(l.quantity.replace(/[,\s]/g, "")), unitPrice: l.unitPrice, total: l.total })),
    charges: charges.filter((c) => c.label.trim()),
  });
  const save = () => start(async () => { setMsg(await saveEstimate(payload())); router.refresh(); });
  const confirm = () => start(async () => {
    const s = await saveEstimate(payload());
    if (s?.error) return setMsg(s);
    setMsg(await confirmEstimate(v.id)); router.refresh();
  });
  const autofill = () => start(async () => {
    const r = await autofillEstimate(v.id);
    if (!r.data) return setMsg({ error: r.error ?? "Auto-fill could not read this file." });
    const d = r.data;
    setV((x) => ({ ...x, extractedBy: "ai", estimateNo: d.estimate_no ?? x.estimateNo, estimateDate: d.estimate_date ?? x.estimateDate,
      vatInclusive: d.vat_inclusive ?? x.vatInclusive, validUntil: d.valid_until ?? x.validUntil, notes: d.notes ?? x.notes }));
    setSpec({ size: d.spec.size ?? "", material: d.spec.material ?? "", gsm: d.spec.gsm ? String(d.spec.gsm) : "", colors: d.spec.colors ?? "", finishing: d.spec.finishing.join(", "), packaging: d.spec.packaging ?? "" });
    if (d.lines.length) setLines(d.lines.map((l) => ({ quantity: String(l.quantity), unitPrice: l.unit_price ?? "", total: l.total ?? "" })));
    setCharges(d.charges.map((c) => ({ label: c.label, amount: c.amount ?? "", recharge: false })));
    setUncertain(d.uncertain);
    setMsg({ message: "Filled in from the file. Check every field against the original before saving — nothing is saved yet." });
  });
  const pickItem = (id: string) => {
    setV({ ...v, printItemId: id || null });
    const it = items.find((i) => i.id === id);
    if (it && !spec.size && !spec.material) setSpec(toDraft(it.spec));
  };

  return (
    <div className="space-y-6">
      {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
      {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
      {uncertain.length ? <Alert tone="warning"><b>Auto-fill was unsure about:</b> {uncertain.join("; ")}</Alert> : null}
      {aiAvailable && !readOnly ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info/30 bg-info/5 p-3 text-sm">
          <Sparkles className="size-5 text-info" />
          <span className="flex-1">Auto-fill reads the original file and fills the form for you to check. Costs about ₱2–5 per estimate.</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={autofill}><Sparkles />Auto-fill from file</Button>
        </div>
      ) : null}

      <fieldset disabled={readOnly || pending} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Estimate details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <F label="Estimate number"><Input value={v.estimateNo} onChange={(e) => setV({ ...v, estimateNo: e.target.value })} placeholder="CE-2024-0099" /></F>
            <F label="Estimate date"><Input type="date" value={v.estimateDate} onChange={(e) => setV({ ...v, estimateDate: e.target.value })} /></F>
            <F label="Valid until (optional)"><Input type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} /></F>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div><p className="text-sm font-medium">Prices include 12% VAT</p><p className="text-xs text-muted-foreground">Off if VAT was added on top.</p></div>
              <Switch checked={v.vatInclusive} onCheckedChange={(c) => setV({ ...v, vatInclusive: c })} aria-label="Prices include VAT" disabled={readOnly} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Print Item</Label>
              <Select value={v.printItemId ?? ""} onChange={(e) => pickItem(e.target.value)}>
                <option value="">— not linked yet —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
              {!v.printItemId && !readOnly ? (
                <div className="flex gap-2 pt-1">
                  <Input placeholder="Or create a new item: name" value={newItem} onChange={(e) => setNewItem(e.target.value)} aria-label="New item name" />
                  <Button type="button" variant="outline" disabled={newItem.trim().length < 2} onClick={() => start(async () => {
                    const r = await createItemForEstimate(v.id, newItem, fromDraft(spec));
                    if (r.id) { setV({ ...v, printItemId: r.id }); setMsg({ message: "Print Item created. Add its approved artwork from the item page." }); router.refresh(); } else setMsg({ error: r.error });
                  })}>Create</Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Specs on the estimate</CardTitle><CardDescription>If these differ from the Print Item’s specs, reorders of it will need a manual quote.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <F label="Size"><Input value={spec.size} onChange={(e) => setSpec({ ...spec, size: e.target.value })} /></F>
            <F label="Material"><Input value={spec.material} onChange={(e) => setSpec({ ...spec, material: e.target.value })} /></F>
            <F label="GSM"><Input inputMode="numeric" value={spec.gsm} onChange={(e) => setSpec({ ...spec, gsm: e.target.value.replace(/\D/g, "") })} /></F>
            <F label="Colours"><Input value={spec.colors} onChange={(e) => setSpec({ ...spec, colors: e.target.value })} placeholder="4/4" /></F>
            <F label="Finishing (comma-separated)"><Input value={spec.finishing} onChange={(e) => setSpec({ ...spec, finishing: e.target.value })} /></F>
            <F label="Packaging"><Input value={spec.packaging} onChange={(e) => setSpec({ ...spec, packaging: e.target.value })} /></F>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Prices per quantity</CardTitle><CardDescription>Type the total or the price per piece — the other is worked out. Each confirmed line becomes an agreed price.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid"><span>Quantity</span><span>Price per piece ₱</span><span>Total ₱</span><span className="w-9" /></div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input inputMode="numeric" value={l.quantity} aria-label={`Quantity ${i + 1}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                <Input inputMode="decimal" value={l.unitPrice} aria-label={`Price per piece ${i + 1}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />
                <Input inputMode="decimal" value={l.total} aria-label={`Total ${i + 1}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))} />
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {!readOnly ? <Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, { quantity: "", unitPrice: "", total: "" }])}><Plus />Add quantity</Button> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>One-time charges</CardTitle><CardDescription>Plates, dies, setup, layout. Turn on “charge again on reorder” only if a reorder needs it again (e.g. plates are remade).</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {charges.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
            {charges.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-40 flex-1" value={c.label} aria-label={`Charge ${i + 1} label`} placeholder="Plates" onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input className="w-32" inputMode="decimal" value={c.amount} aria-label={`Charge ${i + 1} amount`} placeholder="₱" onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <label className="flex items-center gap-2 text-xs"><Switch checked={c.recharge} disabled={readOnly} onCheckedChange={(r) => setCharges(charges.map((x, j) => (j === i ? { ...x, recharge: r } : x)))} aria-label={`Charge ${c.label || i + 1} again on reorder`} />charge again on reorder</label>
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove charge ${i + 1}`} onClick={() => setCharges(charges.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {!readOnly ? <Button type="button" size="sm" variant="outline" onClick={() => setCharges([...charges, { label: "", amount: "", recharge: false }])}><Plus />Add charge</Button> : null}
          </CardContent>
        </Card>

        <Card><CardContent className="pt-5"><F label="Notes (staff only)"><Textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></F></CardContent></Card>
      </fieldset>

      {!readOnly ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <Button variant="outline" disabled={pending} onClick={save}><Save />Save draft</Button>
          <Dialog>
            <DialogTrigger asChild><Button disabled={pending || !v.printItemId}><CheckCircle2 />Confirm prices</Button></DialogTrigger>
            <DialogContent>
              <DialogTitle>Confirm this estimate?</DialogTitle>
                <DialogDescription>Its prices become the agreed prices for this Print Item, and instant reorder quotes will start from them. You can’t edit it afterwards (upload a newer estimate instead). An older estimate never replaces a newer agreed price.</DialogDescription>
              <div className="mt-4 flex justify-end"><Button onClick={confirm} disabled={pending}>Yes, confirm</Button></div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
