"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { kickPush } from "@/lib/push/send";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { sendEmail } from "@/lib/email/send";
import { proofApprovedEmail, proofReadyEmail, revisionSubmittedEmail } from "@/lib/email/templates";
import type { ActionState } from "./account";

const uuid = z.uuid();
const site = () => env().NEXT_PUBLIC_SITE_URL;

/** Client uploaded an attachment to the "attachments" bucket — record it (as the client, RLS checked). */
export async function recordAttachment(input: { organizationId: string; path: string; name: string; size: number; mime?: string }): Promise<{ id?: string; error?: string }> {
  kickPush();
  const me = await getSessionUser();
  if (!me?.organizationId || me.organizationId !== input.organizationId) return { error: "Not allowed." };
  if (!input.path.startsWith(`${me.organizationId}/revisions/`) || input.path.includes("..")) return { error: "Invalid upload." };
  const maxMb = (await getSetting("uploads")).max_file_mb;
  if (input.size > maxMb * 1024 * 1024) return { error: `Files must be ${maxMb} MB or smaller.` };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("files").insert({
    organization_id: me.organizationId, purpose: "revision_attachment", kind: "upload", bucket: "attachments",
    storage_path: input.path, original_name: input.name.slice(0, 255), size_bytes: input.size, mime_type: input.mime ?? null, uploaded_by: me.id,
  }).select("id").single();
  if (error || !data) return { error: "Could not save the attachment." };
  return { id: data.id as string };
}

const submitInput = z.object({
  printItemId: uuid,
  baseVersionId: uuid,
  orderId: uuid.nullable().optional(),
  parentRevisionId: uuid.nullable().optional(),
  notes: z.string().max(4000).default(""),
  markups: z.array(z.object({
    rendition_id: uuid, page_no: z.number().int().min(1), shape: z.enum(["pin", "box"]),
    x_pct: z.number().min(0).max(100), y_pct: z.number().min(0).max(100),
    w_pct: z.number().min(0).max(100).nullable().optional(), h_pct: z.number().min(0).max(100).nullable().optional(),
    comment: z.string().max(2000), sort: z.number().int(), attachment_file_ids: z.array(uuid).max(10),
  })).max(100),
  fieldValues: z.array(z.object({ template_field_id: uuid, value: z.string().max(500) })).max(50),
  attachmentIds: z.array(uuid).max(20),
});

/** Client sends their markups / edited fields / notes / files as one Revision Request. */
export async function submitRevision(input: z.infer<typeof submitInput>): Promise<{ id?: string; error?: string }> {
  kickPush();
  const me = await getSessionUser();
  if (!me?.organizationId) return { error: "Please sign in again." };
  const p = submitInput.safeParse(input);
  if (!p.success) return { error: "Please check your changes and try again." };
  const d = p.data;
  const sb = await supabaseServer();
  const { data: id, error } = await sb.rpc("submit_revision_request", {
    p_print_item_id: d.printItemId, p_base_version_id: d.baseVersionId, p_general_notes: d.notes,
    p_markups: d.markups, p_field_values: d.fieldValues, p_attachment_file_ids: d.attachmentIds,
    p_order_id: d.orderId ?? null, p_parent_revision_id: d.parentRevisionId ?? null,
  });
  if (error || !id) return { error: error?.message ?? "Could not send your changes." };
  await audit({ action: "revision.submitted", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "revision_request", entityId: id as string,
    meta: { markups: d.markups.length, fields: d.fieldValues.length, attachments: d.attachmentIds.length } });
  after(async () => {
    const admin = supabaseAdmin();
    const { data: r } = await admin.from("revision_requests").select("round_no, print_items(name), organizations(name)").eq("id", id).single();
    const { data: staff } = await admin.from("staff_assignments").select("profiles(email, is_active)").eq("organization_id", me.organizationId);
    for (const s of staff ?? []) {
      const prof = s.profiles as unknown as { email: string; is_active: boolean } | null;
      if (!prof?.is_active || !r) continue;
      await sendEmail({ to: prof.email, ...revisionSubmittedEmail({
        company: (r.organizations as unknown as { name: string }).name, item: (r.print_items as unknown as { name: string }).name,
        round: r.round_no as number, by: me.fullName, changes: d.markups.length + d.fieldValues.length, url: `${site()}/staff/revisions/${id}`,
      }) });
    }
  });
  revalidatePath("/app", "layout");
  return { id: id as string };
}

/** Client approves the revised proof (records name, time and IP). */
export async function approveProof(revisionId: string): Promise<ActionState> {
  kickPush();
  const me = await getSessionUser();
  if (!me?.organizationId || !uuid.safeParse(revisionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { ip, userAgent } = await requestMeta();
  const { error } = await sb.rpc("approve_revised_proof", { p_revision_id: revisionId, p_ip: ip, p_user_agent: userAgent });
  if (error) return { error: error.message };
  await audit({ action: "revision.proof_approved", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "revision_request", entityId: revisionId, meta: { ip } });
  after(async () => {
    const admin = supabaseAdmin();
    const { data: r } = await admin.from("revision_requests").select("round_no, print_item_id, print_items(name), organizations(name)").eq("id", revisionId).single();
    if (!r) return;
    const { refreshThumbnail } = await import("@/lib/files/process");
    await refreshThumbnail(r.print_item_id as string);
    const { data: staff } = await admin.from("staff_assignments").select("profiles(email, is_active)").eq("organization_id", me.organizationId);
    for (const s of staff ?? []) {
      const prof = s.profiles as unknown as { email: string; is_active: boolean } | null;
      if (prof?.is_active) await sendEmail({ to: prof.email, ...proofApprovedEmail({
        company: (r.organizations as unknown as { name: string }).name, item: (r.print_items as unknown as { name: string }).name,
        round: r.round_no as number, by: me.fullName, url: `${site()}/staff/revisions/${revisionId}`,
      }) });
    }
  });
  revalidatePath("/app", "layout");
  return { message: "Approved. This version is now Approved for Print." };
}

// ------------------------------------------------------------------ staff

async function staffOnly() {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales") || me.needsMfa) return null;
  return me;
}

export async function setRevisionStatus(revisionId: string, status: "in_prepress" | "cancelled"): Promise<ActionState> {
  kickPush();
  const me = await staffOnly();
  if (!me || !uuid.safeParse(revisionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_revision_status", { p_revision_id: revisionId, p_status: status });
  if (error) return { error: error.message };
  await audit({ action: `revision.${status}`, actorId: me.id, entityType: "revision_request", entityId: revisionId });
  revalidatePath(`/staff/revisions/${revisionId}`);
  return { message: status === "in_prepress" ? "Marked as being worked on." : "Revision cancelled." };
}

export async function replyToMarkup(markupId: string, reply: string, status: "open" | "done" | "question"): Promise<ActionState> {
  kickPush();
  const me = await staffOnly();
  if (!me || !uuid.safeParse(markupId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("revision_markups").update({
    staff_reply: reply.trim().slice(0, 2000) || null, staff_status: status, replied_by: me.id, replied_at: new Date().toISOString(),
  }).eq("id", markupId).select("revision_request_id").maybeSingle();
  if (error || !data) return { error: "Could not save the reply." };
  revalidatePath(`/staff/revisions/${data.revision_request_id}`);
  return { message: "Saved." };
}

/** Make (or reuse) the draft version that will hold the revised proof. */
export async function prepareProofVersion(revisionId: string): Promise<ActionState & { versionId?: string }> {
  kickPush();
  const me = await staffOnly();
  if (!me || !uuid.safeParse(revisionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: r } = await sb.from("revision_requests").select("print_item_id, round_no, status").eq("id", revisionId).maybeSingle();
  if (!r) return { error: "Revision not found." };
  const { data: draft } = await sb.from("artwork_versions").select("id").eq("print_item_id", r.print_item_id).eq("status", "draft").order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (draft) return { versionId: draft.id as string };
  const { data: v, error } = await sb.rpc("create_artwork_version", { p_print_item_id: r.print_item_id, p_change_notes: `Revised proof — Revision ${r.round_no}` });
  if (error) return { error: error.message };
  if (r.status === "open") await sb.rpc("set_revision_status", { p_revision_id: revisionId, p_status: "in_prepress" });
  revalidatePath(`/staff/revisions/${revisionId}`);
  return { versionId: v as string };
}

export async function sendProof(revisionId: string, versionId: string, message: string): Promise<ActionState> {
  kickPush();
  const me = await staffOnly();
  if (!me || !uuid.safeParse(revisionId).success || !uuid.safeParse(versionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("send_revised_proof", { p_revision_id: revisionId, p_version_id: versionId, p_message: message.slice(0, 2000) });
  if (error) return { error: error.message };
  await audit({ action: "revision.proof_sent", actorId: me.id, actorEmail: me.email, entityType: "revision_request", entityId: revisionId, meta: { version_id: versionId } });
  after(async () => {
    const admin = supabaseAdmin();
    const { data: r } = await admin.from("revision_requests").select("round_no, organization_id, submitted_by, proof_message, print_items(name)").eq("id", revisionId).single();
    if (!r) return;
    const { data: people } = await admin.from("memberships").select("profile_id, client_role, profiles(email, is_active)").eq("organization_id", r.organization_id).eq("is_active", true);
    const mail = proofReadyEmail({ item: (r.print_items as unknown as { name: string }).name, round: r.round_no as number, message: r.proof_message as string | null, url: `${site()}/app/revisions/${revisionId}` });
    for (const p of people ?? []) {
      const prof = p.profiles as unknown as { email: string; is_active: boolean } | null;
      if (prof?.is_active && (p.client_role === "client_admin" || p.profile_id === r.submitted_by)) await sendEmail({ to: prof.email, ...mail });
    }
  });
  revalidatePath(`/staff/revisions/${revisionId}`);
  return { message: "Proof sent. The client has been notified." };
}
