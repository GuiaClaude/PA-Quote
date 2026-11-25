import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { MfaForm } from "./mfa-form";
import { t } from "@/i18n";

export const metadata = { title: t.mfa.title };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  if (!user.needsMfa && sp.enroll !== "1") redirect(homeFor(user));
  return <MfaForm home={homeFor(user)} required={user.mfaRequired} />;
}
