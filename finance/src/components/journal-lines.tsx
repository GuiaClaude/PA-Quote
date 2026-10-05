import Link from "next/link";
import { Badge, EmptyState, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export type JLine = { entry_id: string; entry_no: number; entry_date: string; kind: string; entry_memo: string | null; reversed: boolean; line_no: number; code: string; account: string; debit_c: number; credit_c: number };

const KIND: Record<string, { label: string; tone: "neutral" | "brand" | "warn" | "good" }> = {
  auto: { label: "Auto", tone: "brand" },
  manual: { label: "Manual", tone: "neutral" },
  reversal: { label: "Reversal", tone: "warn" },
  opening: { label: "Opening", tone: "good" },
  closing: { label: "Closing", tone: "neutral" },
};

/** Journal lines grouped by entry, debits and credits side by side. */
export function JournalLinesTable({ lines }: { lines: JLine[] }) {
  if (!lines.length) return <EmptyState title="Nothing posted">Drafts, voided and rejected documents do not post.</EmptyState>;
  return (
    <Table>
      <thead><tr><Th>Entry</Th><Th>Account</Th><Th align="right">Debit</Th><Th align="right">Credit</Th></tr></thead>
      <tbody>
        {lines.map((l, i) => {
          const first = i === 0 || lines[i - 1]!.entry_id !== l.entry_id;
          return (
            <tr key={`${l.entry_id}-${l.line_no}`} className={l.reversed ? "text-muted line-through decoration-muted/40" : ""}>
              <Td className="whitespace-nowrap">
                {first && (
                  <span className="flex items-center gap-1.5">
                    <Link href={`/journal/${l.entry_id}`} className="font-medium text-brand-strong no-underline hover:underline">JE {l.entry_no}</Link>
                    <span className="text-muted">{formatDate(l.entry_date)}</span>
                    <Badge tone={KIND[l.kind]?.tone ?? "neutral"}>{KIND[l.kind]?.label ?? l.kind}</Badge>
                  </span>
                )}
              </Td>
              <Td className={l.credit_c ? "pl-8" : ""}>{l.code} · {l.account}</Td>
              <Td align="right">{l.debit_c ? formatPeso(l.debit_c) : ""}</Td>
              <Td align="right">{l.credit_c ? formatPeso(l.credit_c) : ""}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
