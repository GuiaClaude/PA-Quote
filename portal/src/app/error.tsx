"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong.</h1>
      <p className="text-sm text-muted-foreground">Please try again. If it keeps happening, contact your account manager.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
