import { addDays, addMonths, daysBetween, formatDate, MONTHS_SHORT, parseISO, toISO, weekdayMon0, type ISODate } from "./dates";

export type PeriodKind = "week" | "month" | "quarter" | "year" | "custom";

export interface Period {
  kind: PeriodKind;
  start: ISODate; // inclusive
  end: ISODate; // inclusive
}

/** The week (Mon–Sun), month, quarter or calendar year containing `anchor`. */
export function periodContaining(kind: Exclude<PeriodKind, "custom">, anchor: ISODate): Period {
  const { y, m } = parseISO(anchor);
  switch (kind) {
    case "week": {
      const start = addDays(anchor, -weekdayMon0(anchor));
      return { kind, start, end: addDays(start, 6) };
    }
    case "month": {
      const start = toISO(y, m, 1);
      return { kind, start, end: addDays(addMonths(start, 1), -1) };
    }
    case "quarter": {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      const start = toISO(y, qm, 1);
      return { kind, start, end: addDays(addMonths(start, 3), -1) };
    }
    case "year":
      return { kind, start: toISO(y, 1, 1), end: toISO(y, 12, 31) };
  }
}

/** The period of the same length immediately before `p`. */
export function previousPeriod(p: Period): Period {
  if (p.kind === "custom" || p.kind === "week") {
    const len = daysBetween(p.start, p.end) + 1;
    return { kind: p.kind, start: addDays(p.start, -len), end: addDays(p.start, -1) };
  }
  const months = p.kind === "month" ? 1 : p.kind === "quarter" ? 3 : 12;
  const start = addMonths(p.start, -months);
  return { kind: p.kind, start, end: addDays(p.start, -1) };
}

/** The same dates one year earlier. */
export function samePeriodLastYear(p: Period): Period {
  return { kind: p.kind, start: addMonths(p.start, -12), end: addMonths(p.end, -12) };
}

export function periodLabel(p: Period): string {
  const s = parseISO(p.start);
  switch (p.kind) {
    case "month":
      return `${MONTHS_SHORT[s.m - 1]} ${s.y}`;
    case "quarter":
      return `Q${Math.floor((s.m - 1) / 3) + 1} ${s.y}`;
    case "year":
      return `${s.y}`;
    default:
      return `${formatDate(p.start)} – ${formatDate(p.end)}`;
  }
}

/** Month starts ("YYYY-MM-01") covering [start, end]. */
export function monthsBetween(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const s = parseISO(start);
  let cur = toISO(s.y, s.m, 1);
  while (cur <= end) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Parse ?period=month&anchor=2026-09-15 (or start/end for custom) with safe fallbacks. */
export function periodFromParams(
  params: { period?: string; anchor?: string; start?: string; end?: string },
  today: ISODate,
): Period {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (params.period === "custom" && params.start && params.end && iso.test(params.start) && iso.test(params.end) && params.start <= params.end) {
    return { kind: "custom", start: params.start, end: params.end };
  }
  const kind = (["week", "month", "quarter", "year"] as const).find((k) => k === params.period) ?? "month";
  const anchor = params.anchor && iso.test(params.anchor) ? params.anchor : today;
  return periodContaining(kind, anchor);
}
