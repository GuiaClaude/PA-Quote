import Link from "next/link";
import { ArrowRight, Layers, Mail, Phone, PlusCircle, RefreshCcw, PackageSearch, MessageCircle } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { OrderStatusBadge } from "@/components/data/status-badge";
import { formatDate } from "@/lib/dates";
import { signPreviews } from "@/lib/data/previews";
import { Thumb } from "@/components/files/thumb";
import { t } from "@/i18n";

const ACTIVE_EXCLUDED = "(delivered,closed,cancelled)";

export default async function ClientHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const sb = await supabaseServer();

  const { count: quotesReady } = await sb.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "quoted");
  const [{ data: manager }, { data: orders }, { data: history }, { data: items }] = await Promise.all([
    sb.from("staff_assignments").select("profiles(full_name, email, phone, viber, job_title)").eq("is_primary", true).maybeSingle(),
    sb.from("orders").select("id, order_no, status, placed_at, requested_delivery_date, order_items(title)")
      .not("status", "in", ACTIVE_EXCLUDED).is("deleted_at", null).order("placed_at", { ascending: false }).limit(5),
    sb.from("order_items").select("print_item_id, created_at").not("print_item_id", "is", null).order("created_at", { ascending: false }).limit(500),
    sb.from("print_items").select("id, name, code, thumbnail_path, product_categories(name)").is("deleted_at", null).order("updated_at", { ascending: false }).limit(50),
  ]);

  // Most-ordered items first, then the rest.
  const stats = new Map<string, { count: number; last: string }>();
  for (const row of history ?? []) {
    const id = row.print_item_id as string;
    const s = stats.get(id);
    stats.set(id, { count: (s?.count ?? 0) + 1, last: s?.last ?? (row.created_at as string) });
  }
  const quick = [...(items ?? [])]
    .sort((a, b) => (stats.get(b.id as string)?.count ?? 0) - (stats.get(a.id as string)?.count ?? 0))
    .slice(0, 4);
  const thumbs = await signPreviews(sb, quick.map((i) => i.thumbnail_path as string | null));
  const am = manager?.profiles as unknown as { full_name: string; email: string; phone: string | null; viber: string | null; job_title: string | null } | null;

  const actions = [
    { href: "/app/order/reorder", label: t.home.reorder, hint: t.home.reorderHint, Icon: RefreshCcw, cls: "bg-primary text-primary-foreground" },
    { href: "/app/order/new", label: t.home.newOrder, hint: t.home.newOrderHint, Icon: PlusCircle, cls: "bg-accent text-white" },
    { href: "/app/orders", label: t.home.track, hint: t.home.trackHint, Icon: PackageSearch, cls: "bg-sidebar text-white" },
  ];

  return (
    <div className="space-y-8">
      {sp.denied ? <Alert tone="warning">{t.common.forbidden}</Alert> : null}
      <h1 className="text-2xl font-bold tracking-tight">{t.home.greeting(user.fullName)}</h1>
      {quotesReady ? <Alert tone="warning"><b>{quotesReady} quote{quotesReady === 1 ? " is" : "s are"} ready for you.</b> <Link className="font-semibold underline" href="/app/quotes">Review and accept</Link></Alert> : null}

      <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
        {actions.map(({ href, label, hint, Icon, cls }) => (
          <Link key={href} href={href}
            className={`group flex items-center gap-4 rounded-2xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-col sm:items-start sm:py-6 ${cls}`}>
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-white/15"><Icon className="size-6" aria-hidden /></span>
            <span className="flex-1">
              <span className="block text-lg font-bold">{label}</span>
              <span className="block text-sm opacity-85">{hint}</span>
            </span>
            <ArrowRight className="size-5 opacity-70 transition group-hover:translate-x-1 sm:hidden" aria-hidden />
          </Link>
        ))}
      </section>

      <section aria-labelledby="quick-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="quick-title" className="text-lg font-semibold">{t.home.quickReorder}</h2>
          <Link href="/app/items" className="text-sm font-medium text-primary hover:underline">{t.home.viewAll}</Link>
        </div>
        {quick.length === 0 ? (
          <Card><CardContent className="flex items-center gap-3 pt-5 text-sm text-muted-foreground"><Layers className="size-5" />{t.home.noItems}</CardContent></Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {quick.map((item) => {
              const s = stats.get(item.id as string);
              return (
                <li key={item.id as string}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <Link href={`/app/items/${item.id}`} className="block aspect-[4/3] overflow-hidden border-b bg-surface-muted">
                      <Thumb url={item.thumbnail_path ? thumbs[item.thumbnail_path as string] : null} alt={`Preview of ${item.name as string}`} className="size-full" />
                    </Link>
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <Link href={`/app/items/${item.id}`} className="line-clamp-2 text-sm font-semibold hover:underline">{item.name as string}</Link>
                      <p className="text-xs text-muted-foreground">{s ? `${t.home.lastOrdered} ${formatDate(s.last)}` : t.home.neverOrdered}</p>
                      <Link href={`/app/items/${item.id}?reorder=1`}
                        className="mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-soft text-sm font-semibold text-primary hover:bg-primary hover:text-white">
                        <RefreshCcw className="size-4" aria-hidden /> {t.home.reorder}
                      </Link>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="active-title">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="active-title" className="text-lg font-semibold">{t.home.activeOrders}</h2>
            <Link href="/app/orders" className="text-sm font-medium text-primary hover:underline">{t.home.viewAll}</Link>
          </div>
          <Card>
            {(orders ?? []).length === 0 ? (
              <CardContent className="pt-5 text-sm text-muted-foreground">{t.home.noActiveOrders}</CardContent>
            ) : (
              <ul className="divide-y">
                {(orders ?? []).map((o) => {
                  const titles = ((o.order_items as { title: string }[]) ?? []).map((i) => i.title);
                  return (
                    <li key={o.id as string}>
                      <Link href={`/app/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{titles[0] ?? "Order"}{titles.length > 1 ? ` +${titles.length - 1}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{o.order_no as string} · {formatDate(o.placed_at as string)}</p>
                        </div>
                        <OrderStatusBadge status={o.status as string} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <aside aria-labelledby="am-title">
          <h2 id="am-title" className="mb-3 text-lg font-semibold">{t.home.accountManager}</h2>
          <Card>
            {am ? (
              <>
                <CardHeader className="flex-row items-center gap-3">
                  <Avatar name={am.full_name} className="size-12 text-base" />
                  <div>
                    <CardTitle>{am.full_name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{am.job_title ?? "Account Manager"}</p>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {am.phone ? <ContactLink href={`tel:${am.phone.replace(/\s/g, "")}`} Icon={Phone} label={`${t.home.call} ${am.phone}`} /> : null}
                  {am.viber ? <ContactLink href={`viber://chat?number=${encodeURIComponent("+63" + am.viber.replace(/\D/g, "").replace(/^0/, ""))}`} Icon={MessageCircle} label={`${t.home.viber} ${am.viber}`} /> : null}
                  <ContactLink href={`mailto:${am.email}`} Icon={Mail} label={am.email} />
                </CardContent>
              </>
            ) : (
              <CardContent className="pt-5 text-sm text-muted-foreground">Print Amplified will assign your account manager soon.</CardContent>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ContactLink({ href, Icon, label }: { href: string; Icon: typeof Phone; label: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-surface-muted">
      <Icon className="size-4 text-primary" aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  );
}
