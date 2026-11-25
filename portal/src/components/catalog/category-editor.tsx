"use client";
import { useActionState, useState } from "react";
import { saveCategory } from "@/lib/actions/catalog";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

type Cat = { id: string; name: string; description: string; sort: number; isActive: boolean };

export function CategoryEditor({ categories }: { categories: Cat[] }) {
  const [state, action] = useActionState<ActionState, FormData>(saveCategory, undefined);
  const [id, setId] = useState("");
  const cur = categories.find((c) => c.id === id);
  return (
    <Card className="h-fit">
      <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
      <CardContent>
        <form action={action} key={id} className="space-y-3">
          <Select aria-label="Category to edit" value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">+ New category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1"><Label htmlFor="cat-name">Name</Label><Input id="cat-name" name="name" defaultValue={cur?.name} required /></div>
          <div className="space-y-1"><Label htmlFor="cat-desc">Description</Label><Input id="cat-desc" name="description" defaultValue={cur?.description} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="cat-sort">Order</Label><Input id="cat-sort" name="sort" type="number" defaultValue={cur?.sort ?? categories.length + 1} /></div>
            <div className="space-y-1"><Label htmlFor="cat-act">Shown</Label><Select id="cat-act" name="isActive" defaultValue={cur?.isActive === false ? "off" : "on"}><option value="on">Yes</option><option value="off">Hidden</option></Select></div>
          </div>
          {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
          <SubmitButton size="sm">{id ? "Save category" : "Add category"}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
