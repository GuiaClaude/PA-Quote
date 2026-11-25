import { Logo } from "@/components/brand/logo";

export function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <Logo />
      <h1 className="text-2xl font-bold">Almost there</h1>
      <p className="text-muted-foreground">
        The app is running but isn&apos;t connected to its database yet. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill in the Supabase values, then restart. The README explains each step.
      </p>
    </main>
  );
}
