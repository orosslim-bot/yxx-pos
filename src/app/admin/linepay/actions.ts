"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";

const BUCKET = "linepay-qr";
const KEY = "qr.png";

export async function uploadLinePayQr(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file") as File;
  if (!file || file.size === 0) return { error: "請選擇圖片" };

  const supabase = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(KEY, buffer, { contentType: file.type, upsert: true });

  if (error) return { error: error.message };

  revalidatePath("/admin/linepay");
  revalidatePath("/pos");
  return { success: true };
}

export async function getLinePayQrUrl(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.storage.from(BUCKET).list();
  if (!data?.find((f) => f.name === KEY)) return null;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(KEY);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}
