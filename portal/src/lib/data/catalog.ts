import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export async function loadCategoriesAndProducts() {
  const sb = await supabaseServer();
  const [{ data: cats }, { data: prods }] = await Promise.all([
    sb.from("product_categories").select("id, name").is("deleted_at", null).order("sort"),
    sb.from("products").select("id, name, category_id").is("deleted_at", null).order("name"),
  ]);
  return {
    categories: (cats ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    products: (prods ?? []).map((p) => ({ id: p.id as string, name: p.name as string, categoryId: p.category_id as string })),
  };
}
