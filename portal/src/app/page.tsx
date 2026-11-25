import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { SetupNeeded } from "@/components/layout/setup-needed";

/** "/" sends people to the right place: sign in, staff dashboard or client home. */
export default async function Root() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <SetupNeeded />;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.needsMfa) redirect("/login/mfa");
  redirect(homeFor(user));
}
