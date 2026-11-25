import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { t } from "@/i18n";

export default async function ClientNotifications() {
  await requireClient();
  const sb = await supabaseServer();
  const { data } = await sb.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(50);
  // Opening the inbox marks everything as read.
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  return (<><PageHeader title={t.nav.notifications} /><NotificationList items={data ?? []} /></>);
}
