"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { ActionState } from "./account";

const domainRe = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const cleanDomain = (d: string) => d.trim().toLowerCase().replace(/^@/, "");

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "client";
}

const clientForm = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(160),
  billingName: z.string().trim().max(200).optional(),
  tin: z.string().trim().max(40).optional(),
  creditTerms: z.string().trim().max(200).optional(),
  domains: z.string().optional(),
  accountManagerId: z.string().optional(),
});

/** Create a client company. Runs as the staff user — RLS allows pa_admin and pa_sales. */
export async function createClientCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { error: "Only management and sales can add clients." };
  const parsed = clientForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const domains = (parsed.data.domains ?? "").split(/[\s,;]+/).map(cleanDomain).filter(Boolean);
  const bad = domains.find((d) => !domainRe.test(d));
  if (bad) return { error: `"${bad}" doesn't look like an email domain (example: abccorp.com.ph).` };

  const sb = await supabaseServer();
  const slug = `${slugify(parsed.data.name)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: org, error } = await sb.from("organizations").insert({
    name: parsed.data.name, slug, billing_name: parsed.data.billingName || parsed.data.name,
    tin: parsed.data.tin || null, credit_terms: parsed.data.creditTerms || null, created_by: me.id,
  }).select("id").single();
  if (error || !org) return { error: "Could not create the client." };

  // Account manager: sales always manage what they create; management can pick anyone.
  const managerId = me.staffRole === "pa_sales" ? me.id : parsed.data.accountManagerId || me.id;
  await sb.from("staff_assignments").insert({ organization_id: org.id, staff_profile_id: managerId, is_primary: true });
  if (domains.length) await sb.from("organization_domains").insert(domains.map((d) => ({ organization_id: org.id, domain: d })));

  await audit({ action: "client.created", actorId: me.id, actorEmail: me.email, organizationId: org.id, entityType: "organization", entityId: org.id, meta: { name: parsed.data.name, domains } });
  redirect(`/staff/clients/${org.id}?created=1`);
}

const updateForm = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  billingName: z.string().trim().max(200).optional(),
  tin: z.string().trim().max(40).optional(),
  creditTerms: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  allowInstantQuotes: z.string().optional(),
  allowHighres: z.string().optional(),
});

export async function updateClientCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me?.staffRole) return { error: "Not allowed." };
  const parsed = updateForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const patch: Record<string, unknown> = {
    name: d.name, billing_name: d.billingName || null, tin: d.tin || null, credit_terms: d.creditTerms || null,
    notes: d.notes || null, allow_instant_quotes: d.allowInstantQuotes === "on",
  };
  if (me.staffRole === "pa_admin") patch.allow_highres_download = d.allowHighres === "on";
  const sb = await supabaseServer();
  const { error, data } = await sb.from("organizations").update(patch).eq("id", d.organizationId).select("id").maybeSingle();
  if (error || !data) return { error: error?.message.includes("Only management") ? error.message : "Could not save." };
  await audit({ action: "client.updated", actorId: me.id, organizationId: d.organizationId, entityType: "organization", entityId: d.organizationId, meta: patch });
  revalidatePath(`/staff/clients/${d.organizationId}`);
  return { message: "Saved." };
}

export async function addDomain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  const organizationId = String(formData.get("organizationId") ?? "");
  const domain = cleanDomain(String(formData.get("domain") ?? ""));
  if (!me?.staffRole || !z.uuid().safeParse(organizationId).success) return { error: "Not allowed." };
  if (!domainRe.test(domain)) return { error: "Enter a domain like abccorp.com.ph" };
  const sb = await supabaseServer();
  const { error } = await sb.from("organization_domains").insert({ organization_id: organizationId, domain });
  if (error) return { error: error.code === "23505" ? "That domain is already on the list." : "Could not add the domain." };
  await audit({ action: "client.domain_added", actorId: me.id, organizationId, meta: { domain } });
  revalidatePath(`/staff/clients/${organizationId}`);
  return { message: `@${domain} added.` };
}

export async function removeDomain(organizationId: string, domain: string): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me?.staffRole) return { error: "Not allowed." };
  const sb = await supabaseServer();
  await sb.from("organization_domains").delete().eq("organization_id", organizationId).eq("domain", domain);
  await audit({ action: "client.domain_removed", actorId: me.id, organizationId, meta: { domain } });
  revalidatePath(`/staff/clients/${organizationId}`);
  return { message: `@${domain} removed.` };
}

/** Management assigns the account manager shown on the client's home screen. */
export async function setAccountManager(organizationId: string, staffProfileId: string): Promise<ActionState> {
  const me = await getSessionUser();
  if (me?.staffRole !== "pa_admin") return { error: "Only management can change the account manager." };
  const sb = await supabaseServer();
  await sb.from("staff_assignments").update({ is_primary: false }).eq("organization_id", organizationId);
  const { error } = await sb.from("staff_assignments").upsert(
    { organization_id: organizationId, staff_profile_id: staffProfileId, is_primary: true },
    { onConflict: "organization_id,staff_profile_id" },
  );
  if (error) return { error: "Could not change the account manager." };
  await audit({ action: "client.account_manager_changed", actorId: me.id, organizationId, meta: { staff_profile_id: staffProfileId } });
  revalidatePath(`/staff/clients/${organizationId}`);
  return { message: "Account manager updated." };
}
