import { AppShell } from "@/components/shell";
import { requireSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return <AppShell user={{ name: s.name, role: s.role, orgName: s.orgName }}>{children}</AppShell>;
}
