"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";

export async function getBooths() {
  await requireAdmin();
  const db = createServiceClient();
  const { data } = await db.from("booths").select("id, name, pin").order("id");
  return data ?? [];
}

export async function addBooth(name: string, pin: string) {
  await requireAdmin();
  if (!name.trim() || pin.length !== 4) return { error: "攤位名稱不能空白，PIN 需 4 位數字" };
  const db = createServiceClient();
  const { error } = await db.from("booths").insert({ name: name.trim(), pin });
  if (error) return { error: error.message };
  revalidatePath("/admin/booths");
  return { success: true };
}

export async function updateBooth(id: number, name: string, pin: string) {
  await requireAdmin();
  if (!name.trim() || pin.length !== 4) return { error: "攤位名稱不能空白，PIN 需 4 位數字" };
  const db = createServiceClient();
  const { error } = await db.from("booths").update({ name: name.trim(), pin }).eq("id", id);
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
