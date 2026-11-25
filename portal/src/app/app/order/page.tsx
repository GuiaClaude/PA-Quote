import Link from "next/link";
import { PlusCircle, RefreshCcw } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { PageHeader } from "@/components/layout/page-header";
import { t } from "@/i18n";

export default async function OrderHub() {
  await requireClient();
  return (
    <>
      <PageHeader title={t.nav.order} description="Print something again, or order something new." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/app/order/reorder" className="flex items-start gap-4 rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm hover:shadow-md">
          <RefreshCcw className="size-8" aria-hidden /><span><span className="block text-xl font-bold">{t.home.reorder}</span><span className="text-sm opacity-90">{t.home.reorderHint}</span></span>
        </Link>
        <Link href="/app/order/new" className="flex items-start gap-4 rounded-2xl bg-accent p-6 text-white shadow-sm hover:shadow-md">
          <PlusCircle className="size-8" aria-hidden /><span><span className="block text-xl font-bold">{t.home.newOrder}</span><span className="text-sm opacity-90">{t.home.newOrderHint}</span></span>
        </Link>
      </div>
    </>
  );
}
