/** Everything is shown in Philippine time. */
export const TIMEZONE = "Asia/Manila";

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, year: "numeric", month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIMEZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** "3 hours", "2 days" — for "waiting since" badges. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  return `${formatDuration(diff)} ago`;
}

/**
 * The request time, for Server Components (they render once per request,
 * so reading the clock is safe there). Don't use in Client Components.
 */
export function requestTimeMs(): number {
  return Date.now();
}
