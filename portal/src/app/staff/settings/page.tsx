import { requireStaff } from "@/lib/auth/guards";
import { getSetting } from "@/lib/settings";
import { getLogoUrl } from "@/lib/brand";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { SettingsForms } from "./settings-forms";
import { t } from "@/i18n";

export const metadata = { title: t.settings.title };

export default async function SettingsPage() {
  const me = await requireStaff(["pa_admin", "pa_sales"]);
  const [company, branding, payment, email, security, uploads] = await Promise.all([
    getSetting("company"), getSetting("branding"), getSetting("payment_instructions"), getSetting("email"), getSetting("security"), getSetting("uploads"),
  ]);
  const isAdmin = me.staffRole === "pa_admin";
  return (
    <>
      <PageHeader title={t.settings.title} description="Changes apply immediately for everyone and are recorded in the audit log." />
      {!isAdmin ? <Alert tone="info" className="mb-4">{t.settings.onlyAdmin}</Alert> : null}
      {!security.require_mfa ? <Alert tone="warning" className="mb-4"><b>2-step verification is not enforced.</b> Turn it on in &quot;Sign-in &amp; security&quot; before going live.</Alert> : null}
      <SettingsForms logoUrl={await getLogoUrl()} disabled={!isAdmin} initial={{ company, branding, payment_instructions: payment, email, security, uploads }} />
      <div className="mt-6"><PhaseNotice phase={5}>{t.settings.pricing}: {t.settings.pricingNote}</PhaseNotice></div>
    </>
  );
}
