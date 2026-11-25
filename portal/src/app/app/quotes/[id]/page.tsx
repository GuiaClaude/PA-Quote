import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { REQUEST_STATUS } from "@/lib/data/quote-status";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SpecList } from "@/components/data/spec-list";
import { QuoteDecision } from "@/components/ordering/quote-decision";
import { MessageThread } from "@/components/ordering/message-thread";
import { formatDate, formatDateTime } from "@/lib/dates";

export default async function ClientQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClient();
  const sb = await supabaseServer();
  const { data: r } = await sb.from("quote_requests")
    .select("id, request_no, title, status, kind, spec, quantities, needs_design_help, requested_delivery_date, client_po_no, notes, submitted_at, addresses(label, city), quotes(id, quote_no, revision_no, status, lead_time_text, valid_until, vat_inclusive, notes, sent_at, quote_tiers(id, quantity, unit_price, total_centavos)), quote_messages(id, body, created_at, profiles(full_name, staff_role))")
    .eq("id", id).maybeSingle();
  if (!r) notFound();
  const st = REQUEST_STATUS[r.status as string] ?? REQUEST_STATUS.submitted!;
  const quotes = ((r.quotes as unknown as Array<{ id: string; quote_no: string; revision_no: number; status: string; lead_time_text: string | null; valid_until: string | null; vat_inclusive: boolean; notes: string | null; sent_at: string | null; quote_tiers: { id: string; quantity: number; unit_price: string; total_centavos: number }[] }>) ?? [])
    .sort((a, b) => b.revision_no - a.revision_no);
  const current = quotes.find((q) => q.status === "sent" || q.status === "accepted") ?? quotes[0];
  const { data: order } = current?.status === "accepted" ? await sb.from("orders").select("id, order_no").eq("quote_id", current.id).maybeSingle() : { data: null };
  const addr = r.addresses as unknown as { label: string; city: string } | null;
  const messages = ((r.quote_messages as unknown as Array<{ id: string; body: string; created_at: string; profiles: { full_name: string; staff_role: string | null } | null }>) ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ id: m.id, body: m.body, at: m.created_at, who: m.profiles?.full_name ?? "", fromStaff: Boolean(m.profiles?.staff_role) }));

  return (
    <>
      <Link href="/app/quotes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Quotes</Link>
      <PageHeader title={r.title as string} description={`${r.request_no} · requested ${formatDateTime(r.submitted_at as string)}`} actions={<Badge tone={st.tone}>{st.client}</Badge>} />
      {sp.sent ? <Alert tone="success" className="mb-4">Your request was sent. Your account manager will reply with a quote — we&apos;ll notify you.</Alert> : null}
      {order ? <Alert tone="success" className="mb-4">You accepted this quote. Your order is <Link className="font-semibold underline" href={`/app/orders/${order.id}`}>{order.order_no as string}</Link>.</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {current && current.status === "sent" && canSeePrices(user) ? (
            <QuoteDecision quote={{ id: current.id, quoteNo: current.quote_no, leadTime: current.lead_time_text, validUntil: current.valid_until, vatInclusive: current.vat_inclusive, notes: current.notes,
              tiers: current.quote_tiers.sort((a, b) => a.quantity - b.quantity) }} canAct={user.clientRole !== "client_viewer"} />
          ) : current && canSeePrices(user) ? (
            <Card><CardHeader><CardTitle>Quote {current.quote_no}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">This quote is {current.status}.</CardContent></Card>
          ) : r.status === "submitted" ? (
            <Card><CardContent className="pt-5 text-sm">Your account manager is preparing the quote. You&apos;ll get an email and a notification when it&apos;s ready.</CardContent></Card>
          ) : null}
          <Card><CardHeader><CardTitle>Questions</CardTitle></CardHeader><CardContent><MessageThread requestId={id} messages={messages} canPost={user.clientRole !== "client_viewer"} /></CardContent></Card>
        </div>
        <Card className="h-fit"><CardHeader><CardTitle>What you asked for</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SpecList spec={r.spec as Record<string, unknown>} />
            <p><span className="text-muted-foreground">Quantities:</span> {(r.quantities as number[]).map((q) => q.toLocaleString("en-PH")).join(" / ")} pcs</p>
            {r.needs_design_help ? <p>Design / layout help requested</p> : null}
            {addr ? <p><span className="text-muted-foreground">Deliver to:</span> {addr.label}, {addr.city}</p> : null}
            {r.requested_delivery_date ? <p><span className="text-muted-foreground">Needed by:</span> {formatDate(r.requested_delivery_date as string)}</p> : null}
            {r.client_po_no ? <p><span className="text-muted-foreground">PO:</span> {r.client_po_no as string}</p> : null}
            {r.notes ? <p className="whitespace-pre-wrap">{r.notes as string}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
