"use client";

import { useState } from "react";
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { saveClientAction, saveSupplierAction, mergeClientsAction } from "@/server/actions/sales";
import { FormError, useSubmit } from "./common";

export type PartyValues = {
  name: string; tin: string; address: string; contactPerson: string; email: string; phone: string;
  termsDays: string; vatStatus: string; rateBp: string; supplierType?: string; notes: string;
};

export function PartyForm({ kind, id, initial }: { kind: "client" | "supplier"; id?: string; initial?: Partial<PartyValues> }) {
  const [v, setV] = useState<PartyValues>({
    name: "", tin: "", address: "", contactPerson: "", email: "", phone: "", termsDays: "30", vatStatus: "vat",
    rateBp: kind === "client" ? "200" : "0", supplierType: "goods", notes: "", ...initial,
  });
  const set = (k: keyof PartyValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const { submit, error, pending } = useSubmit((r) => (kind === "client" ? `/clients/${r.id}` : "/suppliers"));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => (kind === "client" ? saveClientAction(id ?? null, v) : saveSupplierAction(id ?? null, v)));
      }}
    >
      <Card>
        <CardHeader title={kind === "client" ? "Client" : "Supplier"} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Registered name" className="sm:col-span-2"><Input value={v.name} onChange={set("name")} required /></Field>
          <Field label="TIN" hint="9 digits + branch code, e.g. 123-456-789-000. Used to match imports."><Input value={v.tin} onChange={set("tin")} placeholder="000-000-000-000" /></Field>
          <Field label="VAT status">
            <Select value={v.vatStatus} onChange={set("vatStatus")}>
              <option value="vat">VAT-registered</option>
              <option value="non_vat">Non-VAT</option>
              <option value="zero_rated">Zero-rated</option>
              <option value="exempt">VAT-exempt</option>
            </Select>
          </Field>
          <Field label="Registered address" className="sm:col-span-2"><Input value={v.address} onChange={set("address")} /></Field>
          <Field label="Contact person"><Input value={v.contactPerson} onChange={set("contactPerson")} /></Field>
          <Field label="Email"><Input type="email" value={v.email} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={v.phone} onChange={set("phone")} /></Field>
          <Field label="Payment terms (days)" hint="0 = COD"><Input type="number" min={0} value={v.termsDays} onChange={set("termsDays")} /></Field>
          <Field label={kind === "client" ? "Tax they withhold from us (CWT)" : "Tax we withhold from them (EWT)"}>
            <Select value={v.rateBp} onChange={set("rateBp")}>
              <option value="0">None</option>
              <option value="100">1% (goods)</option>
              <option value="200">2% (services)</option>
              <option value="500">5% (rentals)</option>
              <option value="1000">10% (professional fees)</option>
              <option value="1500">15% (professional fees, high earners)</option>
            </Select>
          </Field>
          {kind === "supplier" && (
            <Field label="Supplier type">
              <Select value={v.supplierType} onChange={set("supplierType")}>
                {["goods", "services", "professional", "rental", "utilities", "government", "other"].map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onChange={set("notes")} /></Field>
        </div>
      </Card>
      <FormError error={error} />
      <div className="flex justify-end"><Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  );
}

export function MergeButton({ fromId, intoId, fromName, intoName }: { fromId: string; intoId: string; fromName: string; intoName: string }) {
  const { submit, error, pending } = useSubmit();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (confirm(`Merge "${fromName}" into "${intoName}"? All billings and payments move to "${intoName}". The name is remembered for future imports.`)) {
            submit(() => mergeClientsAction(fromId, intoId));
          }
        }}
      >
        {pending ? "Merging…" : "Merge"}
      </Button>
      {error && <span className="text-[12px] text-bad">{error}</span>}
    </span>
  );
}
