import Link from "next/link";
import { FileText } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { REQUEST_STATUS } from "@/lib/data/quote-status";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Quotes" };

export default async function ClientQuotes() {
  await requireClient();
  const sb = await supabaseServer();
  const { data } = await sb.from("quote_requests").select("id, request_no, title, status, submitted_at, quantities, quotes(status, valid_until)")
    .is("deleted_at", null).neq("status", "draft").order("submitted_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as Array<{ id: string; request_no: string; title: string; status: string; submitted_at: string; quantities: number[]; quotes: { status: string; valid_until: string | null }[] }>;
  return (
    <>
      <PageHeader title="Quotes" description="Your quote requests and our replies." actions={<Button asChild><Link href="/app/order/new">Request a quote</Link></Button>} />
      {rows.length === 0 ? <EmptyState Icon={FileText} title="No quote requests yet." description="Pick a product under New Order — if it has no standard price, we'll quote you." /> : (
        <Card><ul className="divide-y">{rows.map((r) => {
          const st = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.submitted!;
          const sent = r.quotes.find((q) => q.status === "sent");
          return (
            <li key={r.id}>
              <Link href={`/app/quotes/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.request_no} · {formatDate(r.submitted_at)} · {r.quantities.map((q) => q.toLocaleString("en-PH")).join(" / ")} pcs{sent?.valid_until ? ` · valid until ${formatDate(sent.valid_until)}` : ""}</p>
                </div>
                <Badge tone={st.tone}>{st.client}</Badge>
              </Link>
            </li>
          );
        })}</ul></Card>
      )}
    </>
  );
}
