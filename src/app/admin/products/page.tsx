import { createClient } from "@/lib/supabase/server";
import ProductsManager from "@/components/admin/ProductsManager";
import { Product, Category } from "@/lib/types";

export default async function ProductsPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("*, categories(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("id"),
  ]);

  return (
    <ProductsManager
      initialProducts={(products as Product[]) ?? []}
      categories={(categories as Category[]) ?? []}
    />
  );
}
