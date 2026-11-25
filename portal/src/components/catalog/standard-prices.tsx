"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { saveStandardPrice, setStandardPriceActive } from "@/lib/actions/catalog";
import type { ActionState } from "@/lib/actions/account";
import { specFromSelection, specSummary, type CatalogOption, type OptionKind } from "@/lib/catalog/options";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Price = { id: string; spec: Record<string, unknown>; quantity: number; unit_price: string; total_centavos: number; vat_inclusive: boolean; valid_until: string | null; is_active: boolean };

export function StandardPrices({ productId, options, prices }: { productId: string; options: CatalogOption[]; prices: Price[] }) {
  const [state, action] = useActionState<ActionState, FormData>(saveStandardPrice, undefined);
  const [single, setSingle] = useState<Partial<Record<OptionKind, string>>>({});
  const [finishing, setFinishing] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const spec = useMemo(() => specFromSelection(options, { single, finishing }), [options, single, finishing]);
  const quantities = options.filter((o) => o.kind === "quantity").flatMap((o) => (o.value.quantities as number[]) ?? []);
  const sorted = [...prices].sort((a, b) => specSummary(a.spec).localeCompare(specSummary(b.spec)) || a.quantity - b.quantity);

  return (
    <div className="space-y-5">
      {sorted.length ? (
        <Table>
          <THead><TR><TH>Specs</TH><TH className="text-right">Qty</TH><TH className="text-right">Unit</TH><TH className="text-right">Total</TH><TH>VAT</TH><TH>Valid until</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
          <TBody>{sorted.map((p) => (
            <TR key={p.id} className={p.is_active ? "" : "opacity-50"}>
              <TD className="max-w-80 text-xs">{specSummary(p.spec)}</TD>
              <TD className="tabular text-right">{p.quantity.toLocaleString("en-PH")}</TD>
              <TD className="tabular text-right">{formatUnitPrice(p.unit_price)}</TD>
              <TD className="tabular text-right font-semibold">{formatCentavos(p.total_centavos)}</TD>
              <TD><Badge>{p.vat_inclusive ? "incl." : "excl."}</Badge></TD>
              <TD className="text-xs">{p.valid_until ? formatDate(p.valid_until) : "—"}</TD>
              <TD><Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await setStandardPriceActive(p.id, productId, !p.is_active); })}
                aria-label={p.is_active ? "Hide price" : "Show price"}>{p.is_active ? <EyeOff /> : <Eye />}</Button></TD>
            </TR>
          ))}</TBody>
        </Table>
      ) : <p className="text-sm text-muted-foreground">No standard prices yet — clients will request a quote.</p>}

      <form action={action} className="space-y-3 rounded-xl border border-dashed p-4">
        <p className="text-sm font-semibold">Add or update a price</p>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="spec" value={JSON.stringify(spec)} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["size", "material", "colors", "packaging"] as const).map((k) => {
            const list = options.filter((o) => o.kind === k);
            if (!list.length) return null;
            return (
              <div key={k} className="space-y-1"><Label className="text-xs capitalize">{k === "colors" ? "Colours" : k}</Label>
                <Select value={single[k] ?? ""} onChange={(e) => setSingle((s) => ({ ...s, [k]: e.target.value || undefined }))}>
                  <option value="">—</option>{list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select></div>
            );
          })}
        </div>
        {options.some((o) => o.kind === "finishing") ? (
          <div className="flex flex-wrap gap-3 text-sm">{options.filter((o) => o.kind === "finishing").map((o) => (
            <label key={o.id} className="flex items-center gap-1.5"><input type="checkbox" checked={finishing.includes(o.id)} onChange={(e) => setFinishing((f) => e.target.checked ? [...f, o.id] : f.filter((x) => x !== o.id))} />{o.label}</label>
          ))}</div>
        ) : null}
        <p className="rounded bg-surface-muted px-2 py-1 text-xs">Specs: <b>{specSummary(spec) || "choose above"}</b></p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1"><Label htmlFor="sp-q" className="text-xs">Quantity</Label><Input id="sp-q" name="quantity" type="number" min={1} list="sp-qs" required /><datalist id="sp-qs">{quantities.map((q) => <option key={q} value={q} />)}</datalist></div>
          <div className="space-y-1"><Label htmlFor="sp-t" className="text-xs">Total price (₱)</Label><Input id="sp-t" name="total" inputMode="decimal" placeholder="1,250.00" required /></div>
          <div className="space-y-1"><Label htmlFor="sp-v" className="text-xs">Valid until</Label><Input id="sp-v" name="validUntil" type="date" /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="vatInclusive" defaultChecked />VAT inclusive</label>
        </div>
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
        <SubmitButton size="sm" disabled={!specSummary(spec)}>Save price</SubmitButton>
        <p className="text-xs text-muted-foreground">Same specs and quantity as an existing price? It is updated.</p>
      </form>
    </div>
  );
}
