"use client";
import { useActionState } from "react";
import { createPrintItem, updatePrintItem } from "@/lib/actions/print-items";
import type { ActionState } from "@/lib/actions/account";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

export type ItemFormValues = {
  id?: string; organizationId?: string; name: string; code: string; categoryId: string; productId: string; tags: string;
  size: string; material: string; gsm: string; colors: string; finishing: string; packaging: string; notes: string;
};

export function ItemForm({ values, clients, categories, products }: {
  values: ItemFormValues; clients?: { id: string; name: string }[];
  categories: { id: string; name: string }[]; products: { id: string; name: string; categoryId: string }[];
}) {
  const editing = Boolean(values.id);
  const [state, action] = useActionState<ActionState, FormData>(editing ? updatePrintItem : createPrintItem, undefined);
  return (
    <form action={action} className="space-y-6">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      {editing ? <input type="hidden" name="printItemId" value={values.id} /> : null}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Item</legend>
        {!editing && clients ? (
          <div className="space-y-2">
            <Label htmlFor="f-org">Client *</Label>
            <Select id="f-org" name="organizationId" defaultValue={values.organizationId ?? ""} required>
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field values={values} id="name" label="Item name *" placeholder="Product Brochure A4 Trifold" />
          <Field values={values} id="code" label="Item code" placeholder="ABC-BR-01" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="f-cat">Category</Label>
            <Select id="f-cat" name="categoryId" defaultValue={values.categoryId}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-prod">Catalog product</Label>
            <Select id="f-prod" name="productId" defaultValue={values.productId}>
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>
        <Field values={values} id="tags" label="Tags" placeholder="brochure, sales, 2026" help="Separate with commas. Clients can filter by tags." />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Specs</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field values={values} id="size" label="Size" placeholder='A4, 2" x 3.5", 12 x 10 x 8 in' />
          <Field values={values} id="colors" label="Colours" placeholder="4/4, 4/0 + PMS 286C" />
          <Field values={values} id="material" label="Material / paper stock" placeholder="Gloss Art, C2S, SBS Board" />
          <Field values={values} id="gsm" label="GSM" type="number" placeholder="150" />
        </div>
        <Field values={values} id="finishing" label="Finishing" placeholder="matte lamination, spot UV, die-cut, folding" help="Separate with commas." />
        <Field values={values} id="packaging" label="Packaging" placeholder="bundles of 100, box of 100" />
        <div className="space-y-2">
          <Label htmlFor="f-notes">Notes</Label>
          <Textarea id="f-notes" name="notes" defaultValue={values.notes} />
        </div>
      </fieldset>
      <SubmitButton size="lg" pendingText="Saving…">{editing ? "Save changes" : "Create Print Item"}</SubmitButton>
    </form>
  );
}

function Field({ values, id, label, placeholder, help, type = "text" }: { values: ItemFormValues; id: keyof ItemFormValues; label: string; placeholder?: string; help?: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`f-${id}`}>{label}</Label>
      <Input id={`f-${id}`} name={id} type={type} defaultValue={values[id] ?? ""} placeholder={placeholder} aria-describedby={help ? `f-${id}-h` : undefined} />
      {help ? <p id={`f-${id}-h`} className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}
