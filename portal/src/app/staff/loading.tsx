import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (<div className="space-y-4" aria-busy="true" aria-label="Loading"><Skeleton className="h-8 w-48" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-64" /></div>);
}
