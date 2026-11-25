import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "@/components/catalog/product-form";

export default async function NewProduct() {
  await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const [{ data: cats }, { data: orgs }] = await Promise.all([
    sb.from("product_categories").select("id, name").is("deleted_at", null).order("sort"),
    sb.from("organizations").select("id, name").is("deleted_at", null).order("name"),
  ]);
  return (
    <>
      <Link href="/staff/catalog" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Catalog</Link>
      <PageHeader title="New product" description="Save it, then add photos, the choices clients pick from, and standard prices." />
      <Card className="max-w-2xl"><CardContent className="pt-5">
        <ProductForm categories={(cats ?? []) as { id: string; name: string }[]} clients={(orgs ?? []) as { id: string; name: string }[]} />
      </CardContent></Card>
    </>
  );
}
