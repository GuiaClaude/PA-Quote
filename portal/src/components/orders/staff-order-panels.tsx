"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, BadgeCheck, CheckCircle2, Landmark, Receipt, Save, Trash2 } from "lucide-react";
import { addOrderAttachments, cancelOrder, confirmOrder, recordOrderPhoto, recordPayment, saveOrderPricesAsAgreed, updateOrderStatus, voidPayment } from "@/lib/actions/tracking";
import type { ActionState } from "@/lib/actions/account";
import { PhotoPicker, type Uploaded } from "./photo-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

const FLOW = ["confirmed", "prepress", "approved_for_print", "printing", "finishing", "quality_check", "ready_for_pickup", "out_for_delivery", "delivered", "closed"];
const CHOICES = ["prepress", "waiting_for_revisions", "waiting_for_client_approval", "approved_for_print", "printing", "finishing", "quality_check", "ready_for_pickup", "out_for_delivery", "delivered", "closed", "on_hold"];
const label = (s: string) => (t.status as Record<string, string>)[s] ?? s;

function allowed(from: string): string[] {
  if (["cancelled", "closed"].includes(from)) return [];
  if (from === "delivered") return ["closed"];
  if (from === "submitted") return ["on_hold"];
  return CHOICES.filter((s) => s !== from);
}
function suggested(from: string): string {
  const i = FLOW.indexOf(from);
  const next = i >= 0 ? FLOW[i + 1] : undefined;
  if (from === "out_for_delivery" || from === "ready_for_pickup") return "delivered";
  if (from === "quality_check") return "ready_for_pickup";
  return next && allowed(from).includes(next) ? next : allowed(from)[0] ?? "";
}

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, after?: () => void) => start(async () => { const r = await fn(); setMsg(r); if (!r?.error) { after?.(); router.refresh(); } });
  const banner = msg?.error ? <Alert tone="danger">{msg.error}</Alert> : msg?.message ? <Alert tone="success">{msg.message}</Alert> : null;
  return { run, pending, banner };
}

// ------------------------------------------------------------------ confirm
export function ConfirmPanel({ orderId, items }: { orderId: string; items: { id: string; title: string; quantity: number; totalCentavos: number | null }[] }) {
  const { run, pending, banner } = useAction();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const missing = items.some((i) => i.totalCentavos === null && !prices[i.id]?.trim());
  return (
    <Card className="border-info/40">
      <CardHeader><CardTitle>Confirm this order</CardTitle><CardDescription>Check the price and artwork, then confirm. Change a price only if needed — the client is told and sees the new total.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {banner}
        <ul className="divide-y rounded-lg border">{items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-40 flex-1"><b>{i.title}</b><br /><span className="text-muted-foreground tabular">{i.quantity.toLocaleString("en-PH")} pcs · {i.totalCentavos !== null ? formatCentavos(i.totalCentavos) : "no price yet"}</span></span>
            <div className="w-40 space-y-1"><Label className="text-xs" htmlFor={`cp-${i.id}`}>{i.totalCentavos !== null ? "New total ₱ (optional)" : "Total ₱ (required)"}</Label>
              <Input id={`cp-${i.id}`} inputMode="decimal" value={prices[i.id] ?? ""} onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })} placeholder={i.totalCentavos !== null ? (i.totalCentavos / 100).toFixed(2) : ""} /></div>
          </li>
        ))}</ul>
        <div className="space-y-1"><Label htmlFor="cp-note" className="text-xs">Note to the client (optional)</Label><Input id="cp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rush fee added for the 3-day deadline" /></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending || missing} onClick={() => run(() => confirmOrder(orderId, Object.entries(prices).map(([orderItemId, total]) => ({ orderItemId, total })), note))}><CheckCircle2 />Confirm order</Button>
          <CancelButton orderId={orderId} staff />
        </div>
      </CardContent>
    </Card>
  );
}

export function CancelButton({ orderId, staff }: { orderId: string; staff?: boolean }) {
  const { run, pending, banner } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Ban />Cancel order</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Cancel this order?</DialogTitle>
        <DialogDescription>{staff ? "The client is told, with your reason." : "Print Amplified is told, with your reason. This can't be undone — you can place a new order any time."}</DialogDescription>
        <div className="mt-3 space-y-3">
          {banner}
          <div className="space-y-1"><Label htmlFor="cx-reason">Reason</Label><Textarea id="cx-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Keep order</Button>
            <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => run(() => cancelOrder(orderId, reason), () => setOpen(false))}>Cancel order</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ status
export function StatusPanel({ orderId, organizationId, status }: { orderId: string; organizationId: string; status: string }) {
  const { run, pending, banner } = useAction();
  const options = allowed(status);
  const [to, setTo] = useState(suggested(status));
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(true);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [receipt, setReceipt] = useState(false);
  if (!options.length) return null;
  const delivery = ["delivered", "out_for_delivery", "ready_for_pickup"].includes(to);
  const kind = receipt ? "delivery_receipt" : delivery ? "delivery_photo" : "production_photo";
  const record = (path: string, f: File) => recordOrderPhoto({ orderId, path, name: f.name, size: f.size, mime: f.type || undefined, receipt });
  return (
    <Card>
      <CardHeader><CardTitle>Update status</CardTitle><CardDescription>Now: <b>{label(status)}</b>. You can skip steps.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {banner}
        <div className="space-y-1"><Label htmlFor="st-to">New status</Label>
          <Select id="st-to" value={to} onChange={(e) => setTo(e.target.value)}>{options.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="st-note">Note (optional)</Label><Textarea id="st-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={delivery ? "e.g. Received by Ms. Cruz at the guardhouse" : "e.g. Lamination started"} /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={receipt} onCheckedChange={setReceipt} aria-label="These files are the delivery receipt" />These files are the signed delivery receipt</label>
        <PhotoPicker label={receipt ? "Add delivery receipt" : "Add photos"} accept={receipt ? "image/*,application/pdf" : "image/*"} folder={`${organizationId}/orders/${orderId}/photos`} files={files} onChange={setFiles} record={record} disabled={pending} />
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div><p className="text-sm font-medium">Show this update to the client</p><p className="text-xs text-muted-foreground">Off: an internal note only staff see. The status itself always shows.</p></div>
          <Switch checked={visible} onCheckedChange={setVisible} aria-label="Show this update to the client" />
        </div>
        <Button disabled={pending || !to} onClick={() => run(() => updateOrderStatus({ orderId, to: to as never, note, clientVisible: visible, fileIds: files.map((f) => f.id), kind }), () => { setNote(""); setFiles([]); })}>
          <BadgeCheck />Update to {label(to)}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Add photos or a receipt later, without changing the status. */
export function AddFilesPanel({ orderId, organizationId }: { orderId: string; organizationId: string }) {
  const { run, pending, banner } = useAction();
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [receipt, setReceipt] = useState(true);
  const [note, setNote] = useState("");
  const record = (path: string, f: File) => recordOrderPhoto({ orderId, path, name: f.name, size: f.size, mime: f.type || undefined, receipt });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="size-5" />Add a receipt or photos</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {banner}
        <label className="flex items-center gap-2 text-sm"><Switch checked={receipt} onCheckedChange={setReceipt} aria-label="Delivery receipt" />Signed delivery receipt</label>
        <PhotoPicker label={receipt ? "Add receipt" : "Add photos"} accept={receipt ? "image/*,application/pdf" : "image/*"} folder={`${organizationId}/orders/${orderId}/photos`} files={files} onChange={setFiles} record={record} disabled={pending} />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
        <Button size="sm" disabled={pending || !files.length} onClick={() => run(() => addOrderAttachments(orderId, files.map((f) => f.id), receipt ? "delivery_receipt" : "delivery_photo", note), () => setFiles([]))}>Save</Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ payments
type Payment = { id: string; method: string; reference: string | null; bank: string | null; amountCentavos: number; receivedOn: string; notes: string | null };
export function PaymentsPanel({ orderId, totalCentavos, paidCentavos, payments, today, canRecord, cancelled }: {
  orderId: string; totalCentavos: number; paidCentavos: number; payments: Payment[]; today: string; canRecord: boolean; cancelled: boolean;
}) {
  const { run, pending, banner } = useAction();
  const balance = Math.max(0, totalCentavos - paidCentavos);
  const [f, setF] = useState({ method: "bank_transfer" as "bank_transfer" | "cheque", reference: "", bank: "", amount: balance ? (balance / 100).toFixed(2) : "", receivedOn: today, notes: "" });
  return (
    <div className="space-y-3">
      {banner}
      <dl className="space-y-1 text-sm tabular">
        <div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{formatCentavos(totalCentavos)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd>{formatCentavos(paidCentavos)}</dd></div>
        <div className="flex justify-between border-t pt-1"><dt>Balance</dt><dd className="font-bold">{formatCentavos(balance)}</dd></div>
      </dl>
      {payments.length ? (
        <ul className="divide-y rounded-lg border text-sm">{payments.map((p) => (
          <li key={p.id} className="flex items-start gap-2 p-2.5">
            <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><b>{p.method === "cheque" ? "Cheque" : "Bank transfer"}</b> {p.reference}{p.bank ? ` · ${p.bank}` : ""}
              <span className="block text-xs text-muted-foreground">Received {formatDate(p.receivedOn)}{p.notes ? ` · ${p.notes}` : ""}</span></span>
            <span className="font-semibold tabular">{formatCentavos(p.amountCentavos)}</span>
            {canRecord ? <VoidButton onVoid={(reason) => run(() => voidPayment(p.id, orderId, reason))} pending={pending} /> : null}
          </li>
        ))}</ul>
      ) : <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
      {canRecord && !cancelled ? (
        <details className="rounded-lg border p-3" open={payments.length === 0 && balance > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Record a payment</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2" role="radiogroup" aria-label="Method">
              <div className="flex gap-2">{(["bank_transfer", "cheque"] as const).map((m) => (
                <Button key={m} type="button" size="sm" variant={f.method === m ? "default" : "outline"} role="radio" aria-checked={f.method === m} onClick={() => setF({ ...f, method: m })}>{m === "cheque" ? "Cheque" : "Bank transfer"}</Button>
              ))}</div>
            </div>
            <div className="space-y-1"><Label htmlFor="pay-ref" className="text-xs">{f.method === "cheque" ? "Cheque number" : "Reference number"}</Label><Input id="pay-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pay-bank" className="text-xs">Bank</Label><Input id="pay-bank" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="BDO, BPI, Metrobank…" /></div>
            <div className="space-y-1"><Label htmlFor="pay-amt" className="text-xs">Amount ₱</Label><Input id="pay-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pay-date" className="text-xs">Date received</Label><Input id="pay-date" type="date" max={today} value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="pay-notes" className="text-xs">Notes (optional)</Label><Input id="pay-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. 50% down payment; post-dated cheque" /></div>
            <Button className="sm:col-span-2 sm:justify-self-start" disabled={pending || !f.reference.trim() || !f.amount} onClick={() => run(() => recordPayment({ orderId, ...f }), () => setF({ ...f, reference: "", notes: "" }))}><Save />Record payment</Button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function VoidButton({ onVoid, pending }: { onVoid: (reason: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Remove this payment"><Trash2 /></Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Remove this payment?</DialogTitle>
        <DialogDescription>Use this for a wrong entry or a bounced cheque. The record is kept in the audit log; the payment status updates.</DialogDescription>
        <div className="mt-3 space-y-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. cheque bounced" aria-label="Reason" />
          <div className="flex justify-end"><Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => { onVoid(reason); setOpen(false); }}>Remove payment</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SavePricesButton({ orderId }: { orderId: string }) {
  const { run, pending, banner } = useAction();
  return (
    <div className="space-y-2">
      {banner}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-soft/50 p-3 text-sm">
        <span className="flex-1">Save this order’s final prices as the items’ <b>new agreed prices</b>, dated today? Future instant reorder quotes will start from them.</span>
        <Button size="sm" disabled={pending} onClick={() => run(() => saveOrderPricesAsAgreed(orderId))}><Save />Save as agreed prices</Button>
      </div>
    </div>
  );
}
