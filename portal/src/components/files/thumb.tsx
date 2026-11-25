import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lazy-loaded preview thumbnail (or a placeholder). */
export function Thumb({ url, alt, className }: { url?: string | null; alt: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} className={cn("object-cover object-top select-none", className)} />
  ) : (
    <span className={cn("flex items-center justify-center bg-surface-muted text-muted-foreground", className)}><ImageIcon className="size-1/3 max-h-8 max-w-8" aria-hidden /></span>
  );
}
