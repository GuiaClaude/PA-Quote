import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-[20px] font-semibold">Not found</h1>
      <p className="text-[13px] text-muted">That record doesn't exist, or you don't have access to it.</p>
      <Link href="/dashboard" className="mt-2 text-[13px] font-medium text-brand-strong hover:underline">Back to dashboard</Link>
    </div>
  );
}
