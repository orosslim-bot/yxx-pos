"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function boothLogout() {
  const cookieStore = await cookies();
  cookieStore.delete("booth_id");
  cookieStore.delete("booth_name");
  redirect("/login");
}
