"use client";
import { useState } from "react";
import { NewAddress, type Address } from "@/components/ordering/order-wizard";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Delivery = { addressId: string; requestedDate: string; clientPo: string; notes: string };

export function DeliveryFields({ addresses: initial, value, onChange }: { addresses: Address[]; value: Delivery; onChange: (d: Delivery) => void }) {
  const [addresses, setAddresses] = useState(initial);
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Deliver to</legend>
        {addresses.length === 0 ? <p className="text-sm text-muted-foreground">No saved address yet — add one, or Print Amplified will call you.</p> : null}
        {addresses.map((a) => (
          <label key={a.id} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", value.addressId === a.id && "border-primary bg-primary-soft")}>
            <input type="radio" name="reorder-addr" checked={value.addressId === a.id} onChange={() => onChange({ ...value, addressId: a.id })} className="mt-0.5" />
            <span><b>{a.label}</b>{a.isDefault ? " (default)" : ""}<br /><span className="text-muted-foreground">{a.line}</span></span>
          </label>
        ))}
        <NewAddress onAdded={(a) => { setAddresses((l) => [...l, a]); onChange({ ...value, addressId: a.id }); }} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="rd-date">Needed by (optional)</Label><Input id="rd-date" type="date" value={value.requestedDate} onChange={(e) => onChange({ ...value, requestedDate: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="rd-po">Your PO number (optional)</Label><Input id="rd-po" value={value.clientPo} maxLength={60} onChange={(e) => onChange({ ...value, clientPo: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="rd-notes">Notes (optional)</Label><Textarea id="rd-notes" rows={2} value={value.notes} maxLength={2000} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></div>
      </div>
    </div>
  );
}

export const deliveryPayload = (d: Delivery) => ({ addressId: d.addressId || null, requestedDate: d.requestedDate || null, clientPo: d.clientPo, notes: d.notes });
