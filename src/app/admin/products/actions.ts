"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ProductData = {
  sku?: string | null;
  name: string;
  category_id?: number | null;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  image_url?: string | null;
  image_filename?: string | null;
  note?: string | null;
};

export async function createProduct(data: ProductData) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function updateProduct(id: string, data: Partial<ProductData>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}
