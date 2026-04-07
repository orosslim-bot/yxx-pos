"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { generateUniqueSku } from "@/lib/sku-server";
import { requireAdmin } from "@/lib/require-admin";

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
  await requireAdmin();
  const supabase = createServiceClient();
  const sku = data.sku || await generateUniqueSku();
  const { error } = await supabase.from("products").insert({ ...data, sku });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function updateProduct(id: string, data: Partial<ProductData>) {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("products")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  const supabase = createServiceClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function bulkDeleteProducts(ids: string[]) {
  await requireAdmin();
  if (ids.length === 0) return;
  const supabase = createServiceClient();
  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function duplicateProduct(id: string) {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data, error: fetchError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = data;
  const sku = await generateUniqueSku(); // 複製品永遠生成唯一新 SKU
  const { error } = await supabase.from("products").insert({
    ...rest,
    name: rest.name + "（副本）",
    sku,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

/**
 * 確保商品有 SKU：若已有直接回傳，若沒有則生成唯一 SKU 並存回 DB。
 * 供前端下載標籤前呼叫，確保 DB ↔ 標籤 SKU 永遠一致。
 */
export async function ensureSku(productId: string): Promise<string> {
  await requireAdmin();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("products")
    .select("sku")
    .eq("id", productId)
    .single();
  if (data?.sku) return data.sku;

  const sku = await generateUniqueSku();
  const { error } = await supabase
    .from("products")
    .update({ sku, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
  return sku;
}

export async function uploadProductImage(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file") as File;
  if (!file) throw new Error("沒有收到檔案");

  const supabase = createServiceClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabase.storage
    .from("product-images")
    .upload(filename, buffer, { contentType: file.type, upsert: true });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(filename);

  return { url: urlData.publicUrl, filename };
}
