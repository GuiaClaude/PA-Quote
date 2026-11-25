"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { kickPush } from "@/lib/push/send";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { quoteReadyEmail } from "@/lib/email/templates";
import { formatDate } from "@/lib/dates";
import { tierFromTotal, tierFromUnit } from "@/lib/pricing/tiers";
import type { ActionState } from "./account";

const input = z.object({
  requestId: z.uuid(),
  leadTime: z.string().max(80).default(""),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vatInclusive: z.boolean(),
  notes: z.string().max(2000).default(""),
  tiers: z.array(z.object({ quantity: z.number().int().positive().max(10_000_000), mode: z.enum(["total", "unit"]), price: z.string().min(1).max(30) })).min(1).max(10),
});

/** Staff create a quote (or a revised quote) and send it to the client in one step. */
export async function sendQuoteToClient(raw: z.infer<typeof input>): Promise<ActionState> {
  kickPush();
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { error: "Not allowed." };
  const p = input.safeParse(raw);
  if (!p.success) return { error: "Check the quantities, prices and validity date." };
  const d = p.data;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (d.validUntil < today) return { error: "The validity date is in the past." };
  if (new Set(d.tiers.map((t) => t.quantity)).size !== d.tiers.length) return { error: "Each quantity can appear only once." };
  let tiers;
  try {
    tiers = d.tiers.map((t) => ({ quantity: t.quantity, ...(t.mode === "total" ? tierFromTotal(t.quantity, t.price) : tierFromUnit(t.quantity, t.price)) }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check the prices." };
  }

  const sb = await supabaseServer();
  const { data: r } = await sb.from("quote_requests").select("id, organization_id, title, status, quotes(revision_no)").eq("id", d.requestId).maybeSingle();
  if (!r) return { error: "Request not found." };
  const revision = Math.max(0, ...((r.quotes as { revision_no: number }[]) ?? []).map((q) => q.revision_no)) + 1;
  const { data: q, error } = await sb.from("quotes").insert({
    organization_id: r.organization_id, quote_request_id: r.id, revision_no: revision, lead_time_text: d.leadTime || null,
    valid_until: d.validUntil, vat_inclusive: d.vatInclusive, notes: d.notes || null, status: "draft",
  }).select("id, quote_no").single();
  if (error || !q) return { error: "Could not create the quote." };
  const { error: tErr } = await sb.from("quote_tiers").insert(tiers.map((t) => ({ organization_id: r.organization_id, quote_id: q.id, quantity: t.quantity, unit_price: t.unit, total_centavos: t.totalCentavos })));
  if (tErr) return { error: "Could not save the prices." };
  const { error: sErr } = await sb.rpc("send_quote", { p_quote_id: q.id });
  if (sErr) return { error: sErr.message };

  await audit({ action: "quote.sent", actorId: me.id, actorEmail: me.email, organizationId: r.organization_id, entityType: "quote", entityId: q.id as string,
    meta: { revision, tiers, valid_until: d.validUntil, vat_inclusive: d.vatInclusive } });
  after(async () => {
    const admin = supabaseAdmin();
    const { data: req } = await admin.from("quote_requests").select("submitted_by").eq("id", r.id).single();
    const { data: people } = await admin.from("memberships").select("profile_id, client_role, profiles(email, is_active)").eq("organization_id", r.organization_id).eq("is_active", true);
    const mail = quoteReadyEmail({ title: r.title as string, quoteNo: q.quote_no as string, validUntil: formatDate(d.validUntil), url: `${env().NEXT_PUBLIC_SITE_URL}/app/quotes/${r.id}` });
    for (const m of people ?? []) {
      const prof = m.profiles as unknown as { email: string; is_active: boolean } | null;
      if (prof?.is_active && (m.client_role === "client_admin" || m.profile_id === req?.submitted_by)) await sendEmail({ to: prof.email, ...mail });
    }
  });
  revalidatePath(`/staff/quotes/${r.id}`);
  return { message: `Quote ${q.quote_no} sent. The client can accept it in one tap.` };
}
