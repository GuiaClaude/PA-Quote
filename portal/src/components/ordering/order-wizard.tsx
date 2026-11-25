"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Link2, Loader2, Paperclip, Save, Send, ShoppingCart, Sparkles, Trash2, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { addAddress, placeStandardOrder, recordOrderArtwork, requestQuote, saveDraft } from "@/lib/actions/ordering";
import { canonicalSpec } from "@/lib/spec-canonical";
import { OPTION_LABELS, specFromSelection, specSummary, type CatalogOption, type OptionKind } from "@/lib/catalog/options";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Thumb } from "@/components/files/thumb";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

type Price = { id: string; spec: Record<string, unknown>; quantity: number; unit_price: string; total_centavos: number; vat_inclusive: boolean };
type Address = { id: string; label: string; line: string; isDefault: boolean };
type Upload = { id: string; name: string };
const STEPS = ["Specs", "Quantity", "Artwork", "Delivery"] as const;

export function OrderWizard({ product, organizationId, options, prices, addresses: initialAddresses, maxMb, draft }: {
  product: { id: string; name: string; photo: string | null; leadTime: string | null };
  organizationId: string; options: CatalogOption[]; prices: Price[]; addresses: Address[]; maxMb: number;
  draft: { id: string; payload: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  const d = (draft?.payload ?? {}) as Partial<{ single: Partial<Record<OptionKind, string>>; finishing: string[]; custom: string; quantities: number[]; links: string[]; uploads: Upload[]; needsDesign: boolean; addressId: string; date: string; po: string; notes: string }>;
  const [step, setStep] = useState(0);
  const [single, setSingle] = useState<Partial<Record<OptionKind, string>>>(d.single ?? {});
  const [finishing, setFinishing] = useState<string[]>(d.finishing ?? []);
  const [custom, setCustom] = useState(d.custom ?? "");
  const [quantities, setQuantities] = useState<number[]>(d.quantities ?? []);
  const [customQty, setCustomQty] = useState("");
  const [uploads, setUploads] = useState<Upload[]>(d.uploads ?? []);
  const [links, setLinks] = useState<string[]>(d.links ?? []);
  const [linkInput, setLinkInput] = useState("");
  const [needsDesign, setNeedsDesign] = useState(Boolean(d.needsDesign));
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(d.addressId ?? initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? "");
  const [date, setDate] = useState(d.date ?? "");
  const [po, setPo] = useState(d.po ?? "");
  const [notes, setNotes] = useState(d.notes ?? "");
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [busy, setBusy] = useState<"" | "upload" | "submit" | "draft">("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const spec = useMemo(() => specFromSelection(options, { single, finishing }), [options, single, finishing]);
  const canon = useMemo(() => canonicalSpec(spec), [spec]);
  const priced = useMemo(() => prices.filter((p) => canonicalSpec(p.spec) === canon), [prices, canon]);
  const suggested = useMemo(() => [...new Set([...options.filter((o) => o.kind === "quantity").flatMap((o) => (o.value.quantities as number[]) ?? []), ...priced.map((p) => p.quantity)])].sort((a, b) => a - b), [options, priced]);
  const match = !custom.trim() && quantities.length === 1 ? priced.find((p) => p.quantity === quantities[0]) : undefined;
  const summary = [specSummary(spec), custom.trim() ? `Custom: ${custom.trim()}` : ""].filter(Boolean).join(" · ");
  const kinds = (["size", "material", "colors", "packaging"] as const).filter((k) => options.some((o) => o.kind === k));
  const finishingOpts = options.filter((o) => o.kind === "finishing");

  const problems = (): string | null => {
    if (!summary) return "Choose the specs (step 1).";
    if (!quantities.length) return "Choose at least one quantity (step 2).";
    if (!uploads.length && !links.length && !needsDesign) return "Attach your artwork, add a Drive link, or tick “I need design / layout help” (step 3).";
    if (!addressId) return "Choose a delivery address (step 4).";
    return null;
  };

  function toggleQty(q: number) {
    setQuantities((list) => list.includes(q) ? list.filter((x) => x !== q) : [...list, q].sort((a, b) => a - b).slice(0, 8));
  }

  async function onFiles(files: FileList) {
    setBusy("upload"); setError(null);
    for (const f of Array.from(files)) {
      if (f.size > maxMb * 1024 * 1024) { setError(`${f.name} is larger than ${maxMb} MB.`); continue; }
      const safe = f.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
      const path = `${organizationId}/orders/${crypto.randomUUID()}-${safe}`;
      const { error: e } = await supabaseBrowser().storage.from("attachments").upload(path, f, { contentType: f.type || undefined });
      if (e) { setError(`Could not upload ${f.name}.`); continue; }
      const r = await recordOrderArtwork({ path, name: f.name, size: f.size, mime: f.type || undefined });
      if (r.id) setUploads((u) => [...u, { id: r.id!, name: f.name }]); else setError(r.error ?? "Upload failed.");
    }
    setBusy("");
  }

  async function onSaveDraft() {
    setBusy("draft"); setError(null);
    const r = await saveDraft({ draftId, title: `${product.name}${summary ? ` — ${summary}` : ""}`.slice(0, 160),
      payload: { productId: product.id, single, finishing, custom, quantities, links, uploads, needsDesign, addressId, date, po, notes } });
    setBusy("");
    if (r.draftId) { setDraftId(r.draftId); setInfo("Draft saved. Find it under New Order → Your saved drafts."); } else setError(r.error ?? "Could not save.");
  }

  async function submit() {
    const p = problems();
    if (p) return setError(p);
    setBusy("submit"); setError(null);
    const common = { addressId: addressId || null, requestedDate: date || null, clientPo: po, notes, artworkFileIds: uploads.map((u) => u.id), artworkLinks: links, needsDesign, draftId };
    if (match) {
      const r = await placeStandardOrder({ standardPriceId: match.id, ...common });
      if (r.orderId) return router.push(`/app/orders/${r.orderId}?placed=1`);
      setError(r.error ?? "Could not place the order.");
    } else {
      const fullSpec = { ...spec, notes: custom.trim() };
      const r = await requestQuote({ productId: product.id, title: `${product.name}${summary ? ` — ${summary}` : ""}`.slice(0, 160), spec: fullSpec, quantities, ...common });
      if (r.requestId) return router.push(`/app/quotes/${r.requestId}?sent=1`);
      setError(r.error ?? "Could not send the request.");
    }
    setBusy("");
  }

  return (
    <div className="grid gap-6 pb-40 lg:grid-cols-[1fr_320px] lg:pb-0">
      <div className="space-y-4">
        <ol className="grid grid-cols-4 gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
                className={cn("flex w-full flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium", step === i ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                  step === i ? "border-primary bg-primary text-white" : i < step ? "border-primary text-primary" : "border-input")}>{i < step ? <Check className="size-4" /> : i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <Card><CardContent className="space-y-5 pt-5">
          {step === 0 ? (
            <>
              {kinds.map((k) => (
                <fieldset key={k}>
                  <legend className="mb-2 text-sm font-semibold">{OPTION_LABELS[k]}</legend>
                  <div className="flex flex-wrap gap-2">
                    {options.filter((o) => o.kind === k).map((o) => (
                      <button key={o.id} type="button" role="radio" aria-checked={single[k] === o.id} onClick={() => setSingle((s) => ({ ...s, [k]: s[k] === o.id ? undefined : o.id }))}
                        className={cn("rounded-lg border px-3 py-2 text-sm", single[k] === o.id ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-surface hover:bg-surface-muted")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              {finishingOpts.length ? (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Finishing <span className="font-normal text-muted-foreground">(choose any)</span></legend>
                  <div className="flex flex-wrap gap-2">{finishingOpts.map((o) => (
                    <button key={o.id} type="button" role="checkbox" aria-checked={finishing.includes(o.id)} onClick={() => setFinishing((f) => f.includes(o.id) ? f.filter((x) => x !== o.id) : [...f, o.id])}
                      className={cn("rounded-lg border px-3 py-2 text-sm", finishing.includes(o.id) ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-surface hover:bg-surface-muted")}>
                      {finishing.includes(o.id) ? "✓ " : ""}{o.label}
                    </button>
                  ))}</div>
                </fieldset>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="custom">Something not listed? Describe it</Label>
                <Textarea id="custom" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={1000} placeholder="e.g. Size 5 x 7 in, or a special paper" className="min-h-16" />
                {custom.trim() ? <p className="text-xs text-accent">Custom specs are always quoted by your account manager.</p> : null}
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">Choose one quantity to order now, or several to compare prices in a quote.</p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((q) => {
                  const pr = priced.find((p) => p.quantity === q);
                  return (
                    <button key={q} type="button" role="checkbox" aria-checked={quantities.includes(q)} onClick={() => toggleQty(q)}
                      className={cn("flex min-w-24 flex-col items-center rounded-lg border px-3 py-2", quantities.includes(q) ? "border-primary bg-primary-soft text-primary" : "bg-surface hover:bg-surface-muted")}>
                      <span className="tabular font-semibold">{q.toLocaleString("en-PH")} pcs</span>
                      {pr && !custom.trim() ? <span className="tabular text-xs">{formatCentavos(pr.total_centavos)}</span> : <span className="text-xs text-muted-foreground">quote</span>}
                    </button>
                  );
                })}
                {quantities.filter((q) => !suggested.includes(q)).map((q) => (
                  <button key={q} type="button" onClick={() => toggleQty(q)} className="flex min-w-24 flex-col items-center rounded-lg border border-primary bg-primary-soft px-3 py-2 text-primary">
                    <span className="tabular font-semibold">{q.toLocaleString("en-PH")} pcs</span><span className="text-xs">tap to remove</span>
                  </button>
                ))}
              </div>
              <div className="flex max-w-xs gap-2">
                <Input type="number" min={1} inputMode="numeric" placeholder="Other quantity" value={customQty} onChange={(e) => setCustomQty(e.target.value)} aria-label="Other quantity" />
                <Button type="button" variant="outline" onClick={() => { const n = Number(customQty); if (Number.isInteger(n) && n > 0) { toggleQty(n); setCustomQty(""); } }}><Plus />Add</Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Upload your artwork</p>
                <ul className="space-y-1">{uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-sm"><Paperclip className="size-4" /><span className="flex-1 truncate">{u.name}</span>
                    <button type="button" aria-label={`Remove ${u.name}`} onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))}><Trash2 className="size-4 text-muted-foreground" /></button></li>
                ))}</ul>
                <Button type="button" variant="outline" disabled={busy === "upload"} onClick={() => fileInput.current?.click()}>{busy === "upload" ? <Loader2 className="animate-spin" /> : <Paperclip />}Choose files</Button>
                <input ref={fileInput} type="file" multiple className="sr-only" accept=".pdf,.ai,.psd,.eps,.indd,.tif,.tiff,.jpg,.jpeg,.png,.zip,.svg" onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ""; }} />
                <p className="text-xs text-muted-foreground">PDF, AI, PSD, EPS, INDD, TIFF, JPG, PNG or ZIP, up to {maxMb} MB each.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">…or paste a Google Drive link</p>
                <ul className="space-y-1">{links.map((l) => (
                  <li key={l} className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5 text-sm"><Link2 className="size-4" /><span className="flex-1 truncate">{l}</span>
                    <button type="button" aria-label="Remove link" onClick={() => setLinks((x) => x.filter((y) => y !== l))}><Trash2 className="size-4 text-muted-foreground" /></button></li>
                ))}</ul>
                <div className="flex gap-2">
                  <Input type="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)} placeholder="https://drive.google.com/…" aria-label="Drive link" />
                  <Button type="button" variant="outline" onClick={() => { if (/^https:\/\/(drive|docs)\.google\.com\//.test(linkInput.trim())) { setLinks((l) => [...l, linkInput.trim()]); setLinkInput(""); } else setError("Paste a Google Drive link (https://drive.google.com/…)."); }}>Add</Button>
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input type="checkbox" checked={needsDesign} onChange={(e) => setNeedsDesign(e.target.checked)} className="mt-0.5 size-4" />
                <span><b className="flex items-center gap-1"><Sparkles className="size-4 text-accent" />I need design / layout help</b><span className="text-muted-foreground">Our designers will prepare the artwork. Design work may be quoted separately.</span></span>
              </label>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">Deliver to</legend>
                {addresses.map((a) => (
                  <label key={a.id} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", addressId === a.id && "border-primary bg-primary-soft")}>
                    <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-0.5" />
                    <span><b>{a.label}</b><br /><span className="text-muted-foreground">{a.line}</span></span>
                  </label>
                ))}
                <NewAddress onAdded={(a) => { setAddresses((l) => [...l, a]); setAddressId(a.id); }} />
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="date">Needed by</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="po">Your PO number</Label><Input id="po" value={po} maxLength={60} onChange={(e) => setPo(e.target.value)} /></div>
              </div>
              {product.leadTime ? <p className="text-xs text-muted-foreground">Usual lead time: {product.leadTime}.</p> : null}
              <div className="space-y-1"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, contact person…" /></div>
            </>
          ) : null}

          <div className="flex justify-between gap-2 border-t pt-4">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft />Back</Button>
            {step < 3 ? <Button type="button" onClick={() => setStep((s) => s + 1)}>Next<ChevronRight /></Button> : null}
          </div>
        </CardContent></Card>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {info ? <Alert tone="success">{info}</Alert> : null}
      </div>

      {/* Summary: sidebar on desktop, sticky bar on phones */}
      <aside className="pb-safe fixed inset-x-0 bottom-14 z-30 border-t bg-surface/95 p-3 backdrop-blur lg:static lg:inset-auto lg:z-auto lg:h-fit lg:rounded-xl lg:border lg:p-0 lg:backdrop-blur-none">
        <div className="hidden lg:block"><Thumb url={product.photo} alt="" className="aspect-[4/3] w-full rounded-t-xl border-b" /></div>
        <div className="space-y-3 lg:p-4">
          <div className="hidden lg:block">
            <p className="font-semibold">{product.name}</p>
            <p className="text-xs text-muted-foreground">{summary || "Choose the specs"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{quantities.length ? quantities.map((q) => q.toLocaleString("en-PH")).join(" / ") + " pcs" : "No quantity yet"}</p>
          </div>
          <div className="flex items-center justify-between gap-3 lg:block">
            {match ? (
              <div>
                <p className="tabular text-xl font-bold text-primary">{formatCentavos(match.total_centavos)}</p>
                <p className="text-xs text-muted-foreground">{formatUnitPrice(match.unit_price)}/pc · {match.vat_inclusive ? "VAT inclusive" : "+ VAT"}</p>
              </div>
            ) : (
              <div><p className="font-semibold text-accent">Price by quote</p><p className="text-xs text-muted-foreground">Your account manager replies with prices{quantities.length > 1 ? " for each quantity" : ""}.</p></div>
            )}
            <div className="flex shrink-0 gap-2 lg:mt-3 lg:flex-col">
              <Button type="button" disabled={busy !== ""} onClick={() => void submit()} className="lg:w-full" size="lg">
                {busy === "submit" ? <Loader2 className="animate-spin" /> : match ? <ShoppingCart /> : <Send />}{match ? "Place order" : "Request quote"}
              </Button>
              <Button type="button" variant="outline" disabled={busy !== ""} onClick={() => void onSaveDraft()} className="lg:w-full" aria-label="Save draft">
                {busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />}<span className="hidden sm:inline">Save draft</span>
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function NewAddress({ onAdded }: { onAdded: (a: Address) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "", recipient: "", phone: "", line1: "", barangay: "", city: "", province: "", zip: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><Plus />Add a new address</Button>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Label, e.g. Warehouse" value={f.label} onChange={set("label")} aria-label="Label" />
        <Input placeholder="Recipient" value={f.recipient} onChange={set("recipient")} aria-label="Recipient" />
        <Input placeholder="Street / building" value={f.line1} onChange={set("line1")} aria-label="Street" className="sm:col-span-2" />
        <Input placeholder="Barangay" value={f.barangay} onChange={set("barangay")} aria-label="Barangay" />
        <Input placeholder="City" value={f.city} onChange={set("city")} aria-label="City" />
        <Input placeholder="Province" value={f.province} onChange={set("province")} aria-label="Province" />
        <Input placeholder="Mobile" value={f.phone} onChange={set("phone")} aria-label="Mobile" inputMode="tel" />
      </div>
      {err ? <p className="text-xs text-danger">{err}</p> : null}
      <Button type="button" size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await addAddress(f);
        setBusy(false);
        if (r.id) { onAdded({ id: r.id, label: f.label, line: `${f.line1}, ${f.city}`, isDefault: false }); setOpen(false); } else setErr(r.error ?? "Could not save.");
      }}>Save address</Button>
    </div>
  );
}
