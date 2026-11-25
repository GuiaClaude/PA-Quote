import Link from "next/link";
import { Calculator } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPricingRules, manilaToday } from "@/lib/pricing/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PricingRulesForms } from "@/components/pricing/rules-forms";

export const metadata = { title: "Pricing rules" };

export default async function PricingPage() {
  const me = await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const today = manilaToday();
  const [{ rules, inflation }, { data: settings }, { data: cats }, { data: surcharges }, { data: addons }] = await Promise.all([
    loadPricingRules(),
    supabaseAdmin().from("pricing_settings").select("*").order("version_no", { ascending: false }).limit(1).single(),
    sb.from("product_categories").select("id, name").order("sort"),
    sb.from("category_surcharges").select("id, label, pct, material_key, effective_from, effective_to, product_categories(name)").order("effective_from", { ascending: false }),
    sb.from("fixed_addons").select("id, label, scope, amount_centavos, effective_from, effective_to, product_categories(name)").order("effective_from", { ascending: false }),
  ]);
  const unconfirmed = inflation.filter((r) => r.needsConfirmation).length;
  return (
    <>
      <PageHeader title="Pricing rules" description="How instant reorder quotes are calculated. Every change is kept with its date, and each quote records the rules it used."
        actions={<Button asChild><Link href="/staff/pricing/preview"><Calculator />Quote preview tool</Link></Button>} />
      {me.staffRole !== "pa_admin" ? <Alert tone="info" className="mb-4">Only management can change pricing rules. You can view them and use the quote preview tool.</Alert> : null}
      {unconfirmed ? <Alert tone="warning" className="mb-4"><b>{unconfirmed} inflation rate{unconfirmed === 1 ? " is" : "s are"} still marked “please confirm”.</b> Check them against PSA figures and press Save on each.</Alert> : null}
      <PricingRulesForms isAdmin={me.staffRole === "pa_admin"} today={today}
        settings={{ roundingStepPesos: rules.roundingStepPesos, roundingScope: rules.roundingScope, vatRatePct: Number(rules.vatRatePct), quoteValidityDays: rules.quoteValidityDays,
          maxEstimateAgeYears: Number(rules.maxEstimateAgeYears), maxAdjustmentPct: Number(rules.maxAdjustmentPct), showBreakdownToClients: Boolean(settings?.show_breakdown_to_clients),
          quoteReplyTargetHours: (settings?.quote_reply_target_hours as number) ?? 24, version: rules.version }}
        inflation={inflation.map((r) => ({ year: r.year, ratePct: String(r.ratePct), needsConfirmation: r.needsConfirmation, note: r.note }))}
        categories={(cats ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        surcharges={(surcharges ?? []).map((s) => ({ id: s.id as string, label: s.label as string, value: `${s.pct}%`, target: (s.product_categories as unknown as { name: string } | null)?.name ?? `material: ${s.material_key}`, from: s.effective_from as string, to: s.effective_to as string | null }))}
        addons={(addons ?? []).map((a) => ({ id: a.id as string, label: a.label as string, value: String(a.amount_centavos), target: a.scope === "order" ? "every quote" : (a.product_categories as unknown as { name: string } | null)?.name ?? "", from: a.effective_from as string, to: a.effective_to as string | null }))} />
    </>
  );
}
