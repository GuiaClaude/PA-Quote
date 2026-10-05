import { daysBetween, type ISODate } from "./dates";

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "Over 90 days",
};

/** Days past due as of `asOf` (0 or negative = not yet due). */
export function daysOverdue(dueDate: ISODate, asOf: ISODate): number {
  return daysBetween(dueDate, asOf);
}

/** Aging bucket by days past the due date. Not yet due (or due today) = current. */
export function agingBucket(dueDate: ISODate, asOf: ISODate): AgingBucket {
  const d = daysOverdue(dueDate, asOf);
  if (d <= 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export function emptyAging(): Record<AgingBucket, number> {
  return { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

/** Sum open balances into buckets. */
export function ageBalances(items: { dueDate: ISODate; balance: number }[], asOf: ISODate): Record<AgingBucket, number> {
  const out = emptyAging();
  for (const it of items) {
    if (it.balance === 0) continue;
    out[agingBucket(it.dueDate, asOf)] += it.balance;
  }
  return out;
}
