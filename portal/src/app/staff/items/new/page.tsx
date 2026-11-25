import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCategoriesAndProducts } from "@/lib/data/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ItemForm } from "@/components/items/item-form";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sp = await searchParams;
  const sb = await supabaseServer();
  const [{ data: clients }, catalog] = await Promise.all([
    sb.from("organizations").select("id, name").is("deleted_at", null).order("name"),
    loadCategoriesAndProducts(),
  ]);
  return (
    <>
      <Link href="/staff/items" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Print Items</Link>
      <PageHeader title="New Print Item" description="Save the item first, then upload its artwork files or add Drive links." />
      <Card className="max-w-3xl"><CardContent className="pt-5">
        <ItemForm clients={(clients ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))} {...catalog}
          values={{ organizationId: sp.client, name: "", code: "", categoryId: "", productId: "", tags: "", size: "", material: "", gsm: "", colors: "", finishing: "", packaging: "", notes: "" }} />
      </CardContent></Card>
    </>
  );
}
