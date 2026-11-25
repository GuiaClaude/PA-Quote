"use client";
import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { removeOption, saveOption } from "@/lib/actions/catalog";
import type { ActionState } from "@/lib/actions/account";
import { OPTION_KINDS, OPTION_LABELS, type CatalogOption, type OptionKind } from "@/lib/catalog/options";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

export function OptionsManager({ productId, options }: { productId: string; options: CatalogOption[] }) {
  const [state, action] = useActionState<ActionState, FormData>(saveOption, undefined);
  const [kind, setKind] = useState<OptionKind>("size");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <dl className="space-y-2">
        {OPTION_KINDS.map((k) => {
          const list = options.filter((o) => o.kind === k);
          return (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <dt className="pt-1 font-medium text-muted-foreground">{OPTION_LABELS[k]}</dt>
              <dd className="flex flex-wrap gap-1">
                {list.length === 0 ? <span className="pt-1 text-xs text-muted-foreground">—</span> : list.map((o) => (
                  <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1 text-xs">
                    {o.label}
                    <button type="button" disabled={pending} aria-label={`Remove ${o.label}`} onClick={() => start(async () => { await removeOption(o.id, productId); })} className="rounded-full p-0.5 hover:bg-danger-soft hover:text-danger"><X className="size-3" /></button>
                  </span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
      <form action={action} className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[140px_1fr_90px_auto]" key={state?.message}>
        <input type="hidden" name="productId" value={productId} />
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as OptionKind)} aria-label="Kind">
          {OPTION_KINDS.map((k) => <option key={k} value={k}>{OPTION_LABELS[k]}</option>)}
        </Select>
        {kind === "quantity" ? (
          <Input name="quantities" placeholder="100, 200, 500, 1000" aria-label="Quantities" className="sm:col-span-2" />
        ) : (
          <>
            <Input name="label" placeholder={{ size: "A5 (148 x 210 mm)", material: "Gloss Art", colors: "4/4 — full colour both sides", finishing: "Matte lamination", packaging: "Bundles of 100", quantity: "" }[kind]} aria-label="Option" required />
            {kind === "material" ? <Input name="gsm" type="number" placeholder="GSM" aria-label="GSM" /> : <span />}
          </>
        )}
        {kind === "quantity" ? <input type="hidden" name="label" value="Quantities" /> : null}
        <SubmitButton size="sm" variant="outline">Add</SubmitButton>
      </form>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </div>
  );
}
