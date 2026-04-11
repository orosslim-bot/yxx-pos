"use server";

import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";

export async function getBooths() {
  await requireAdmin();
  const db = createServiceClient();
  const { data } = await db.from("booths").select("id, name").order("id");
  return data ?? [];
}

export async function addBooth(name: string, pin: string) {
  await requireAdmin();
  if (!name.trim()) return { error: "攤位名稱不能空白" };
  if (!/^\d{4}$/.test(pin)) return { error: "PIN 需為 4 位數字" };

  const pinHash = await bcrypt.hash(pin, 10);
  const db = createServiceClient();
  const { error } = await db.from("booths").insert({ name: name.trim(), pin: pinHash });
  if (error) return { error: error.message };
  revalidatePath("/admin/booths");
  return { success: true };
}

/**
 * 更新攤位。
 * - pin 留空 → 只更新名稱，不動 PIN
 * - pin 為 4 位數字 → 重新 hash 並更新
 */
export async function updateBooth(id: number, name: string, pin?: string) {
  await requireAdmin();
  if (!name.trim()) return { error: "攤位名稱不能空白" };

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { name: name.trim() };

  if (pin && pin.length > 0) {
    if (!/^\d{4}$/.test(pin)) return { error: "PIN 需為 4 位數字" };
    updateData.pin = await bcrypt.hash(pin, 10);
  }

  const { error } = await db.from("booths").update(updateData).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/booths");
  return { success: true };
}

export async function deleteBooth(id: number) {
  await requireAdmin();
  const db = createServiceClient();
  const { error } = await db.from("booths").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/booths");
  return { success: true };
}
