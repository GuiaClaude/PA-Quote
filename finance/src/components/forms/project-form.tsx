"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { saveProjectAction } from "@/server/actions/sales";
import { FormError, useSubmit } from "./common";

export function ProjectForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [v, setV] = useState({ ceNumber: "", name: "", clientId: "", poNumber: "", jobType: "", quoted: "", status: "ongoing", startDate: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const { submit, error, pending } = useSubmit(() => setV({ ...v, ceNumber: "", name: "", poNumber: "", quoted: "" }));
  return (
    <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); submit(() => saveProjectAction({ ...v, clientId: v.clientId || null, quoted: v.quoted || undefined })); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="CE#" hint="e.g. CE# ABC2026-001 or PA-CE-2026-0001"><Input value={v.ceNumber} onChange={set("ceNumber")} required /></Field>
        <Field label="Project name"><Input value={v.name} onChange={set("name")} required /></Field>
        <Field label="Client">
          <Select value={v.clientId} onChange={set("clientId")}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="PO #"><Input value={v.poNumber} onChange={set("poNumber")} /></Field>
        <Field label="Job type"><Input value={v.jobType} onChange={set("jobType")} /></Field>
        <Field label="Quoted amount (₱)"><Input inputMode="decimal" value={v.quoted} onChange={set("quoted")} /></Field>
        <Field label="Status">
          <Select value={v.status} onChange={set("status")}>
            <option value="quoted">Quoted</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="billed">Billed</option><option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Start date"><Input type="date" value={v.startDate} onChange={set("startDate")} /></Field>
      </div>
      <FormError error={error} />
      <div className="flex justify-end"><Button disabled={pending}>{pending ? "Saving…" : "Add project"}</Button></div>
    </form>
  );
}
