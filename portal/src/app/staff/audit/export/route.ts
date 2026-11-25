import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { auditQuery, parseAuditFilters } from "@/lib/data/audit-query";
import { audit } from "@/lib/audit";

const MAX_ROWS = 20_000;
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Quote everything; neutralise spreadsheet formulas (=, +, -, @) so a value can't run in Excel.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** pa_admin only: the filtered audit log as CSV (up to 20,000 rows). The export itself is logged. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (me?.staffRole !== "pa_admin" || me.needsMfa) return new NextResponse("Not allowed", { status: 403 });
  const f = parseAuditFilters(Object.fromEntries(req.nextUrl.searchParams));
  const sb = await supabaseServer();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_ROWS; from += 1000) {
    const { data, error } = await auditQuery(sb, f).range(from, from + 999);
    if (error) return new NextResponse("Could not export", { status: 500 });
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  const head = ["time_utc", "action", "who", "company", "entity_type", "entity_id", "ip", "user_agent", "details"];
  const lines = rows.map((r) => [r.created_at, r.action, r.actor_email ?? "System", (r.organizations as { name: string } | null)?.name ?? "", r.entity_type, r.entity_id, r.ip, r.user_agent, r.meta].map(cell).join(","));
  await audit({ action: "audit.exported", actorId: me.id, actorEmail: me.email, meta: { filters: f, rows: rows.length } });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return new NextResponse(`﻿${head.join(",")}\n${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-log-${day}.csv"`, "Cache-Control": "no-store" },
  });
}
