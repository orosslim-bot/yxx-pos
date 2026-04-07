"use server";

import { createServiceClient } from "@/lib/supabase/service";
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
  const supabase = createServiceClient();
  const { error } = await supabase.from("products").insert(data);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function updateProduct(id: string, data: Partial<ProductData>) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("products")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function deleteProduct(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function bulkDeleteProducts(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = createServiceClient();
  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function duplicateProduct(id: string) {
  const supabase = createServiceClient();
  const { data, error: fetchError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = data;
  const { error } = await supabase.from("products").insert({
    ...rest,
    name: rest.name + "（副本）",
    sku: rest.sku ? null : null, // 副本不繼承 SKU，避免重複
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function uploadProductImage(formData: FormData) {
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
