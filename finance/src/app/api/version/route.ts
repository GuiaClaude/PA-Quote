import { NextResponse } from "next/server";
import { withUser } from "@/server/db";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await withUser(s, async (tx) => {
    const [r] = await tx<{ version: number; at: string | null }[]>`select version, at::text from org_data_versions where org_id = ${s.orgId}`;
    return r;
  });
  return NextResponse.json({ version: row?.version ?? 0, at: row?.at ?? null });
}
