import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const { booth_name, pin } = await req.json();

  if (!booth_name || !pin) {
    return NextResponse.json({ error: "缺少攤位名稱或 PIN 碼" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, pin")
    .eq("name", booth_name)
    .order("id")
    .limit(1);

  const booth = booths?.[0];
  if (!booth) {
    return NextResponse.json({ error: "攤位不存在" }, { status: 401 });
  }

  if (booth.pin !== pin) {
    return NextResponse.json({ error: "PIN 碼錯誤" }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24,
    path: "/",
  };
  res.cookies.set("booth_id", String(booth.id), cookieOptions);
  res.cookies.set("booth_name", booth.name, cookieOptions);

  return res;
}
