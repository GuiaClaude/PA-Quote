import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Link2, Paperclip } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { REQUEST_STATUS } from "@/lib/data/quote-status";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpecList } from "@/components/data/spec-list";
import { QuoteBuilder } from "@/components/ordering/quote-builder";
import { MessageThread } from "@/components/ordering/message-thread";
import { formatCentavos } from "@/lib/money";
import { formatDate, formatDateTime, requestTimeMs } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffQuote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data: r } = await sb.from("quote_requests")
    .select(`id, request_no, title, kind, status, spec, quantities, needs_design_help, needs_quote_reasons, requested_delivery_date, client_po_no, notes, submitted_at, reply_due_at,
      artwork_file_ids, artwork_links, organization_id, organizations(name), products(name, default_lead_time_text), print_items(id, name), addresses(label, line1, city),
      submitter:profiles!quote_requests_submitted_by_fkey(full_name, email, phone),
      quotes(id, quote_no, revision_no, status, valid_until, vat_inclusive, sent_at, responded_at, decline_reason, quote_tiers(quantity, total_centavos)),
      quote_messages(id, body, created_at, profiles(full_name, staff_role))`)
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: settings }, { data: files }] = await Promise.all([
    sb.from("pricing_settings").select("quote_validity_days").order("version_no", { ascending: false }).limit(1).maybeSingle(),
    (r.artwork_file_ids as string[]).length ? sb.from("files").select("id, original_name, storage_path").in("id", r.artwork_file_ids as string[]) : Promise.resolve({ data: [] }),
  ]);
  const signed: Record<string, string> = {};
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length) { const { data } = await sb.storage.from("attachments").createSignedUrls(paths, 600); for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl; }

  const st = REQUEST_STATUS[r.status as string] ?? REQUEST_STATUS.submitted!;
  const quotes = ((r.quotes as unknown as Array<{ id: string; quote_no: string; revision_no: number; status: string; valid_until: string | null; vat_inclusive: boolean; sent_at: string | null; responded_at: string | null; decline_reason: string | null; quote_tiers: { quantity: number; total_centavos: number }[] }>) ?? []).sort((a, b) => b.revision_no - a.revision_no);
  const product = r.products as unknown as { name: string; default_lead_time_text: string | null } | null;
  const submitter = r.submitter as unknown as { full_name: string; email: string; phone: string | null } | null;
  const addr = r.addresses as unknown as { label: string; line1: string; city: string } | null;
  const validDays = (settings?.quote_validity_days as number | undefined) ?? 15;
  const validDefault = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(requestTimeMs() + validDays * 86_400_000));
  const open = r.status === "submitted" || r.status === "quoted";
  const messages = ((r.quote_messages as unknown as Array<{ id: string; body: string; created_at: string; profiles: { full_name: string; staff_role: string | null } | null }>) ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ id: m.id, body: m.body, at: m.created_at, who: m.profiles?.full_name ?? "", fromStaff: Boolean(m.profiles?.staff_role) }));

  return (
    <>
      <Link href="/staff/quotes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.nav.quotes}</Link>
      <PageHeader title={r.title as string} breadcrumb={<Link className="hover:underline" href={`/staff/clients/${r.organization_id}`}>{(r.organizations as unknown as { name: string }).name}</Link>}
        description={`${r.request_no} · ${r.kind === "reorder" ? "Reorder" : "New order"} · requested ${formatDateTime(r.submitted_at as string)}${submitter ? ` by ${submitter.full_name}` : ""}`}
        actions={<Badge tone={st.tone}>{st.staff}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {open ? (
            <QuoteBuilder requestId={id} quantities={r.quantities as number[]} leadTime={product?.default_lead_time_text ?? ""} validDefault={validDefault}
              revising={quotes.some((q) => q.status === "sent")} />
          ) : null}
          {quotes.length ? (
            <Card><CardHeader><CardTitle>Quotes</CardTitle></CardHeader><CardContent className="p-0">
              <ul className="divide-y text-sm">{quotes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="font-semibold">{q.quote_no}</span><span className="text-muted-foreground">rev {q.revision_no}</span>
                  <Badge tone={q.status === "accepted" ? "success" : q.status === "sent" ? "accent" : "neutral"}>{q.status}</Badge>
                  <span className="tabular flex-1 text-right">{q.quote_tiers.sort((a, b) => a.quantity - b.quantity).map((tt) => `${tt.quantity.toLocaleString("en-PH")}: ${formatCentavos(tt.total_centavos)}`).join(" · ")}</span>
                  <span className="w-full text-xs text-muted-foreground">Sent {formatDateTime(q.sent_at)}{q.valid_until ? ` · valid until ${formatDate(q.valid_until)}` : ""}{q.responded_at ? ` · answered ${formatDateTime(q.responded_at)}` : ""}{q.decline_reason ? ` · “${q.decline_reason}”` : ""}</span>
                </li>
              ))}</ul>
            </CardContent></Card>
          ) : null}
          <Card><CardHeader><CardTitle>Questions</CardTitle></CardHeader><CardContent><MessageThread requestId={id} messages={messages} canPost viewerIsStaff /></CardContent></Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Request</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            {(r.needs_quote_reasons as string[]).length ? <div className="flex flex-wrap gap-1">{(r.needs_quote_reasons as string[]).map((x) => <Badge key={x} tone="accent">{t.staffDash.reasons[x] ?? x}</Badge>)}</div> : null}
            {product ? <p><span className="text-muted-foreground">Product:</span> {product.name}</p> : null}
            {(r.print_items as unknown as { id: string; name: string } | null) ? <p><span className="text-muted-foreground">Print Item:</span> <Link className="text-primary hover:underline" href={`/staff/items/${(r.print_items as unknown as { id: string }).id}`}>{(r.print_items as unknown as { name: string }).name}</Link></p> : null}
            <SpecList spec={r.spec as Record<string, unknown>} />
            <p><span className="text-muted-foreground">Quantities:</span> <b>{(r.quantities as number[]).map((q) => q.toLocaleString("en-PH")).join(" / ")}</b></p>
            {r.needs_design_help ? <Badge tone="warning">Needs design / layout help</Badge> : null}
            {addr ? <p><span className="text-muted-foreground">Deliver to:</span> {addr.label} — {addr.line1}, {addr.city}</p> : null}
            {r.requested_delivery_date ? <p><span className="text-muted-foreground">Needed by:</span> {formatDate(r.requested_delivery_date as string)}</p> : null}
            {r.client_po_no ? <p><span className="text-muted-foreground">PO:</span> {r.client_po_no as string}</p> : null}
            {r.notes ? <p className="whitespace-pre-wrap rounded bg-surface-muted p-2">{r.notes as string}</p> : null}
            {r.reply_due_at && open ? <p className="text-xs text-muted-foreground">Reply target: {formatDateTime(r.reply_due_at as string)}</p> : null}
          </CardContent></Card>
          {(files ?? []).length || (r.artwork_links as string[]).length ? (
            <Card><CardHeader><CardTitle>Client artwork</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {(files ?? []).map((f) => signed[f.storage_path as string] ? <a key={f.id as string} href={signed[f.storage_path as string]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><Paperclip className="size-4" />{f.original_name as string}</a> : null)}
              {(r.artwork_links as string[]).map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-primary hover:underline"><Link2 className="size-4" />{l}</a>)}
            </CardContent></Card>
          ) : null}
          {submitter ? <Card><CardHeader><CardTitle>Contact</CardTitle></CardHeader><CardContent className="text-sm"><p className="font-medium">{submitter.full_name}</p><p className="text-muted-foreground">{submitter.email}{submitter.phone ? ` · ${submitter.phone}` : ""}</p></CardContent></Card> : null}
        </div>
      </div>
    </>
  );
}
