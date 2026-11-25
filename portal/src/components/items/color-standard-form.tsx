"use client";
import { useActionState } from "react";
import { saveColorStandard } from "@/lib/actions/print-items";
import type { ActionState } from "@/lib/actions/account";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

type Values = { printItemId: string; pantone: string; cmyk: string; paperStock: string; pressMachine: string; notes: string; approvedByName: string; approvedAt: string };

export function ColorStandardForm({ values, disabled }: { values: Values; disabled?: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveColorStandard, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="printItemId" value={values.printItemId} />
      <fieldset disabled={disabled} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="cs-p">Pantone references</Label><Input id="cs-p" name="pantone" defaultValue={values.pantone} placeholder="PMS 286 C, PMS 7408 C" /></div>
        <div className="space-y-2">
          <Label htmlFor="cs-c">CMYK targets</Label>
          <Textarea id="cs-c" name="cmyk" defaultValue={values.cmyk} placeholder={"ABC Blue: 100 72 0 6\nMango Orange: 0 60 100 0"} aria-describedby="cs-c-h" className="font-mono" />
          <p id="cs-c-h" className="text-xs text-muted-foreground">One colour per line: name, then C M Y K.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="cs-ps">Paper stock</Label><Input id="cs-ps" name="paperStock" defaultValue={values.paperStock} /></div>
          <div className="space-y-2"><Label htmlFor="cs-pm">Press / machine</Label><Input id="cs-pm" name="pressMachine" defaultValue={values.pressMachine} placeholder='Komori (26"x19")' list="presses" /></div>
        </div>
        <datalist id="presses">
          {['Komori (26"x19")', 'Kord (25"x18")', 'MO (26"x19")', 'Sord (25"x35")', 'Eneo (40"x13")'].map((p) => <option key={p} value={p} />)}
        </datalist>
        <div className="space-y-2"><Label htmlFor="cs-n">Notes</Label><Textarea id="cs-n" name="notes" defaultValue={values.notes} placeholder="What to watch on press" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="cs-ab">Approved by</Label><Input id="cs-ab" name="approvedByName" defaultValue={values.approvedByName} placeholder="Client contact's name" /></div>
          <div className="space-y-2"><Label htmlFor="cs-ad">Approved on</Label><Input id="cs-ad" name="approvedAt" type="date" defaultValue={values.approvedAt} /></div>
        </div>
      </fieldset>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      {!disabled ? <SubmitButton>Save colour standard</SubmitButton> : null}
    </form>
  );
}
