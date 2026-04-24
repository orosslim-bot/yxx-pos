import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const resp = NextResponse.redirect(url);

  resp.cookies.delete("booth_id");
  resp.cookies.delete("booth_name");
  resp.cookies.delete("booth_sig");
  resp.cookies.delete("last_active");

  return resp;
}
