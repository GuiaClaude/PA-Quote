"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteDraft } from "@/lib/actions/ordering";
import { Card } from "@/components/ui/card";

export function DraftList({ drafts }: { drafts: { id: string; title: string; updated: string; productId: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card><ul className="divide-y">{drafts.map((d) => (
      <li key={d.id} className="flex items-center gap-2 px-4 py-2">
        <Link href={d.productId ? `/app/order/new/${d.productId}?draft=${d.id}` : "/app/order/new"} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-muted-foreground">Saved {d.updated}</span>
        </Link>
        <button type="button" disabled={pending} aria-label={`Delete draft ${d.title}`} onClick={() => start(async () => { await deleteDraft(d.id); router.refresh(); })}
          className="rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 className="size-4" /></button>
      </li>
    ))}</ul></Card>
  );
}
