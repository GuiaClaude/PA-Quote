import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { versionPages, loadTemplate } from "@/lib/data/versions";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { TemplateDesigner } from "@/components/templates/template-designer";

export const metadata = { title: "Editable fields" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items").select("id, name, approved_version_id, organizations(name)").eq("id", id).maybeSingle();
  if (!item) notFound();
  const [pages, template, { data: fonts }] = await Promise.all([
    item.approved_version_id ? versionPages(sb, item.approved_version_id as string) : Promise.resolve([]),
    loadTemplate(sb, id),
    sb.from("fonts").select("id, family, weight, style, files(storage_path)").order("family"),
  ]);
  const fontList = [];
  for (const f of fonts ?? []) {
    const path = (f.files as unknown as { storage_path: string } | null)?.storage_path;
    const { data } = path ? await sb.storage.from("assets").createSignedUrl(path, 3600) : { data: null };
    if (data?.signedUrl) fontList.push({ id: f.id as string, label: `${f.family} ${f.weight}${f.style === "italic" ? " italic" : ""}`, url: data.signedUrl });
  }
  return (
    <>
      <Link href={`/staff/items/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{item.name as string}</Link>
      <PageHeader title="Editable fields" breadcrumb={(item.organizations as unknown as { name: string }).name}
        description="Draw a box over each piece of text clients may change (name, phone, price, date…). Clients then edit it and see the result instantly." />
      {!pages.length ? <Alert tone="warning">Approve a version with a preview first — fields are drawn on the approved artwork.</Alert> : (
        <TemplateDesigner printItemId={id} pages={pages} fonts={fontList}
          initial={template ? { renditionId: template.renditionId, fields: template.fields } : null} />
      )}
    </>
  );
}
