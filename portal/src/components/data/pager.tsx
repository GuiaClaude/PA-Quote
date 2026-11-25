import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pager({ page, total, size, base }: { page: number; total: number; size: number; base: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const sep = base.includes("?") ? "&" : "?";
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={page <= 1}><Link href={`${base}${sep}page=${Math.max(1, page - 1)}`}>Previous</Link></Button>
        <Button asChild variant="outline" size="sm" aria-disabled={page >= pages}><Link href={`${base}${sep}page=${Math.min(pages, page + 1)}`}>Next</Link></Button>
      </div>
    </nav>
  );
}
