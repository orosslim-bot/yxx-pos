"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function getBooths() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("booths").select("id, name").order("id");
  return data ?? [];
}

export async function boothLogout() {
  const cookieStore = await cookies();
  cookieStore.delete("booth_id");
  cookieStore.delete("booth_name");
  redirect("/login");
}
