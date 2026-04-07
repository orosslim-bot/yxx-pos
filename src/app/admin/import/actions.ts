"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

function generateSku(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

type ImportRow = {
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  image_filename: string;
  note: string;
};

export async function importProducts(rows: ImportRow[]) {
  const supabase = createServiceClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name");
  const categoryMap = new Map(
    categories?.map((c) => [c.name, c.id]) ?? []
  );

  const products = rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      sku: r.sku || generateSku(),
      name: r.name.trim(),
      category_id: categoryMap.get(r.category) ?? null,
      price: Number(r.price) || 0,
      cost: Number(r.cost) || 0,
      stock: Number(r.stock) || 0,
      low_stock_threshold: Number(r.low_stock_threshold) || 1,
      image_filename: r.image_filename || null,
      note: r.note || null,
    }));

  if (products.length === 0) throw new Error("沒有有效的商品資料（品名不能為空）");

  const { error } = await supabase.from("products").insert(products);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/products");
  return { count: products.length };
}
