"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function getBooths() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("booths").select("id, name").order("id");
  return data ?? [];
}

export async function boothLogin(boothId: number, pin: string) {
  const supabase = createServiceClient();
  const { data: booth, error } = await supabase
    .from("booths")
    .select("id, name, pin")
    .eq("id", boothId)
    .single();

  if (error || !booth) return { error: "攤位不存在" };
  if (booth.pin !== pin) return { error: "PIN 碼錯誤" };

  const cookieStore = await cookies();
  cookieStore.set("booth_session", JSON.stringify({ id: booth.id, name: booth.name }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  return { success: true };
}

export async function boothLogout() {
  const cookieStore = await cookies();
  cookieStore.delete("booth_session");
  redirect("/login");
}
