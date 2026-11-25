import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { Card } from "@/components/ui/card";
import { t } from "@/i18n";

export default async function NewOrder() {
  await requireClient();
  const sb = await supabaseServer();
  const { data: categories } = await sb.from("product_categories").select("id, name, description, products(id, name, description, default_lead_time_text)").order("sort");
  return (
    <>
      <PageHeader title={t.home.newOrder} description="Our catalog — the guided order form comes in Phase 4." />
      <PhaseNotice phase={4}>Choose a product, fill in a guided spec form, and get an instant price or a quote.</PhaseNotice>
      <div className="mt-6 space-y-6">
        {(categories ?? []).map((c) => (
          <section key={c.id as string}>
            <h2 className="mb-2 text-lg font-semibold">{c.name as string}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {((c.products as Array<{ id: string; name: string; description: string | null; default_lead_time_text: string | null }>) ?? []).map((p) => (
                <li key={p.id}><Card className="h-full p-4"><p className="font-semibold">{p.name}</p><p className="text-sm text-muted-foreground">{p.description}</p>{p.default_lead_time_text ? <p className="mt-2 text-xs font-medium text-primary">{p.default_lead_time_text}</p> : null}</Card></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
