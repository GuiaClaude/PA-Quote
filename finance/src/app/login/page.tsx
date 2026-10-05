import { redirect } from "next/navigation";
import { Logo, Wordmark } from "@/components/logo";
import { Card, Notice } from "@/components/ui";
import { sql } from "@/server/db";
import { createSession, getSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

async function signInAs(formData: FormData) {
  "use server";
  if (process.env.AUTH_MODE !== "dev") throw new Error("Demo sign-in is disabled.");
  const userId = String(formData.get("userId") ?? "");
  const [u] = await sql<{ id: string }[]>`select user_id as id from memberships where user_id = ${userId} limit 1`;
  if (!u) throw new Error("Unknown user");
  await createSession(u.id);
  redirect("/dashboard");
}

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const devMode = process.env.AUTH_MODE === "dev";
  const users = devMode
    ? await sql<{ user_id: string; full_name: string; email: string; role: string }[]>`
        select m.user_id, p.full_name, u.email, m.role from memberships m
        join profiles p on p.user_id = m.user_id join auth.users u on u.id = m.user_id
        order by case m.role when 'owner' then 1 when 'bookkeeper' then 2 else 3 end`
    : [];
  const roleText: Record<string, string> = {
    owner: "Everything, including closing and unlocking periods",
    bookkeeper: "Enter, import and edit in open periods",
    viewer: "Read-only reports and dashboard",
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo size={34} />
          <Wordmark />
        </div>
        <Card className="p-6">
          <h1 className="text-[18px] font-semibold">Sign in</h1>
          {devMode ? (
            <>
              <p className="mt-1 text-[13px] text-muted">Local preview. Choose a demo user to see what each role can do.</p>
              <div className="mt-4 space-y-2">
                {users.map((u) => (
                  <form key={u.user_id} action={signInAs}>
                    <input type="hidden" name="userId" value={u.user_id} />
                    <button className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/40">
                      <span className="flex items-center justify-between">
                        <span className="font-medium">{u.full_name}</span>
                        <span className="text-[12px] font-medium capitalize text-brand-strong">{u.role}</span>
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{roleText[u.role]}</span>
                    </button>
                  </form>
                ))}
              </div>
              <div className="mt-4">
                <Notice tone="warn">Demo sign-in is for the local preview only. The deployed app uses email + password and Google sign-in.</Notice>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Email and Google sign-in are configured in the deployment step (Supabase Auth).</p>
          )}
        </Card>
        <p className="mt-4 text-center text-[12px] text-muted">All data in this preview is made up.</p>
      </div>
    </div>
  );
}
