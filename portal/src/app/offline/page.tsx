import { WifiOff } from "lucide-react";
export const metadata = { title: "Offline" };
export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <WifiOff className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-muted-foreground">Check your connection. Your orders and files will be here when you&apos;re back online.</p>
    </main>
  );
}
