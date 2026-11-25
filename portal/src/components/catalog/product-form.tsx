"use client";
import { useActionState, useState } from "react";
import { saveProduct } from "@/lib/actions/catalog";
import type { ActionState } from "@/lib/actions/account";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

type Product = { id: string; name: string; description: string; categoryId: string; leadTime: string; visibility: "all" | "selected"; isActive: boolean; sort: number; clients: string[] };

export function ProductForm({ categories, clients, product }: { categories: { id: string; name: string }[]; clients: { id: string; name: string }[]; product?: Product }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProduct, undefined);
  const [visibility, setVisibility] = useState(product?.visibility ?? "all");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <div className="space-y-1"><Label htmlFor="p-name">Name *</Label><Input id="p-name" name="name" defaultValue={product?.name} required /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="p-cat">Category *</Label>
          <Select id="p-cat" name="categoryId" defaultValue={product?.categoryId ?? ""} required><option value="" disabled>Choose</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="p-lead">Lead time</Label><Input id="p-lead" name="leadTime" defaultValue={product?.leadTime} placeholder="5–7 working days" /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="p-desc">Description</Label><Textarea id="p-desc" name="description" defaultValue={product?.description} /></div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who can order it</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="visibility" value="all" checked={visibility === "all"} onChange={() => setVisibility("all")} />All clients</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="visibility" value="selected" checked={visibility === "selected"} onChange={() => setVisibility("selected")} />Only selected clients</label>
        {visibility === "selected" ? (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3">
            {clients.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="clients" value={c.id} defaultChecked={product?.clients.includes(c.id)} />{c.name}</label>)}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Other clients never see client-only products, not even their names.</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} />Shown in the catalog</label>
        <div className="space-y-1"><Label htmlFor="p-sort">Order</Label><Input id="p-sort" name="sort" type="number" defaultValue={product?.sort ?? 0} /></div>
      </div>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      <SubmitButton>{product ? "Save product" : "Create product"}</SubmitButton>
    </form>
  );
}
