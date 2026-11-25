import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { versionPages, type PageWithRendition } from "./versions";
import type { Markup } from "@/components/revisions/markup-layer";

export type RevisionView = {
  id: string; organizationId: string; organizationName: string; printItemId: string; itemName: string; roundNo: number; status: string;
  generalNotes: string | null; proofMessage: string | null; submittedAt: string; submittedBy: string | null; proofSentAt: string | null; approvedAt: string | null;
  baseVersionId: string; resultVersionId: string | null; orderId: string | null; orderNo: string | null;
  markups: (Markup & { id: string; staffReply: string | null; attachments: Attachment[] })[];
  fieldValues: { fieldId: string; label: string; defaultText: string; value: string }[];
  attachments: Attachment[];
  rounds: { id: string; roundNo: number; status: string; submittedAt: string }[];
  basePages: PageWithRendition[];
  proofPages: PageWithRendition[];
};
type Attachment = { id: string; name: string; url: string | null };

/** Everything about one revision request — read through the user's own access (RLS). */
export async function loadRevision(sb: SupabaseClient, id: string): Promise<RevisionView | null> {
  const { data: r } = await sb.from("revision_requests")
    .select(`id, organization_id, print_item_id, round_no, status, general_notes, proof_message, submitted_at, proof_sent_at, approved_at,
      base_version_id, result_version_id, order_id, thread_id, organizations(name), print_items(name), orders(order_no),
      submitter:profiles!revision_requests_submitted_by_fkey(full_name),
      revision_markups(id, rendition_id, page_no, shape, x_pct, y_pct, w_pct, h_pct, comment, staff_reply, staff_status, sort),
      template_field_values(value, template_fields(id, label, default_text)),
      revision_attachments(markup_id, files(id, original_name, storage_path, bucket))`)
    .eq("id", id).maybeSingle();
  if (!r) return null;

  const atts = (r.revision_attachments as unknown as { markup_id: string | null; files: { id: string; original_name: string; storage_path: string; bucket: string } | null }[]) ?? [];
  const paths = atts.map((a) => a.files?.storage_path).filter(Boolean) as string[];
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await sb.storage.from("attachments").createSignedUrls(paths, 600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }
  const toAtt = (a: (typeof atts)[number]): Attachment => ({ id: a.files!.id, name: a.files!.original_name, url: signed[a.files!.storage_path] ?? null });

  const [{ data: rounds }, basePages, proofPages] = await Promise.all([
    sb.from("revision_requests").select("id, round_no, status, submitted_at").eq("thread_id", r.thread_id ?? r.id).order("round_no"),
    versionPages(sb, r.base_version_id as string),
    r.result_version_id ? versionPages(sb, r.result_version_id as string) : Promise.resolve([]),
  ]);

  const markups = ((r.revision_markups as unknown as Array<Record<string, unknown>>) ?? [])
    .sort((a, b) => (a.sort as number) - (b.sort as number))
    .map((m, i) => ({
      id: m.id as string, key: m.id as string, renditionId: m.rendition_id as string, pageNo: m.page_no as number,
      shape: m.shape as "pin" | "box", x_pct: Number(m.x_pct), y_pct: Number(m.y_pct),
      w_pct: m.w_pct != null ? Number(m.w_pct) : null, h_pct: m.h_pct != null ? Number(m.h_pct) : null,
      comment: m.comment as string, number: i + 1, staffStatus: m.staff_status as string, staffReply: (m.staff_reply as string | null) ?? null,
      attachments: atts.filter((a) => a.markup_id === m.id && a.files).map(toAtt),
    }));

  return {
    id: r.id as string, organizationId: r.organization_id as string, organizationName: (r.organizations as unknown as { name: string }).name,
    printItemId: r.print_item_id as string, itemName: (r.print_items as unknown as { name: string }).name,
    roundNo: r.round_no as number, status: r.status as string, generalNotes: r.general_notes as string | null, proofMessage: r.proof_message as string | null,
    submittedAt: r.submitted_at as string, submittedBy: (r.submitter as unknown as { full_name: string } | null)?.full_name ?? null,
    proofSentAt: r.proof_sent_at as string | null, approvedAt: r.approved_at as string | null,
    baseVersionId: r.base_version_id as string, resultVersionId: r.result_version_id as string | null,
    orderId: r.order_id as string | null, orderNo: (r.orders as unknown as { order_no: string } | null)?.order_no ?? null,
    markups,
    fieldValues: ((r.template_field_values as unknown as { value: string; template_fields: { id: string; label: string; default_text: string } }[]) ?? [])
      .map((v) => ({ fieldId: v.template_fields.id, label: v.template_fields.label, defaultText: v.template_fields.default_text, value: v.value })),
    attachments: atts.filter((a) => !a.markup_id && a.files).map(toAtt),
    rounds: (rounds ?? []).map((x) => ({ id: x.id as string, roundNo: x.round_no as number, status: x.status as string, submittedAt: x.submitted_at as string })),
    basePages, proofPages,
  };
}

export const REVISION_STATUS: Record<string, { client: string; staff: string; tone: "warning" | "info" | "success" | "neutral" | "accent" }> = {
  open: { client: "With Print Amplified", staff: "New — waiting for prepress", tone: "warning" },
  in_prepress: { client: "Being revised by prepress", staff: "In prepress", tone: "info" },
  proof_sent: { client: "Waiting for your approval", staff: "Proof sent — waiting for client", tone: "accent" },
  changes_requested: { client: "More changes requested", staff: "Client asked for more changes", tone: "neutral" },
  approved: { client: "Approved for Print", staff: "Approved by client", tone: "success" },
  cancelled: { client: "Cancelled", staff: "Cancelled", tone: "neutral" },
};
