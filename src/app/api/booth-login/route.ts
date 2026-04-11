import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/service";
import { signBoothSession } from "@/lib/booth-mac";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { booth_name, pin } = body as { booth_name?: string; pin?: string };

  // 基本輸入驗證
  if (typeof booth_name !== "string" || !booth_name.trim()) {
    return NextResponse.json({ error: "缺少攤位名稱" }, { status: 400 });
  }
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN 需為 4 位數字" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name, pin, failed_attempts, locked_until")
    .eq("name", booth_name.trim())
    .limit(1);

  const booth = booths?.[0];
  if (!booth) {
    return NextResponse.json({ error: "攤位不存在" }, { status: 401 });
  }

  // ── 鎖定檢查 ──
  if (booth.locked_until && new Date(booth.locked_until) > new Date()) {
    const t = new Date(booth.locked_until).toLocaleTimeString("zh-TW", {
      hour: "2-digit", minute: "2-digit",
    });
    return NextResponse.json({ error: `嘗試次數過多，請於 ${t} 後再試` }, { status: 429 });
  }

  // ── PIN 驗證（支援 bcrypt hash 及舊版明文自動升級）──
  let isValid = false;
  const storedPin: string = booth.pin ?? "";

  if (storedPin.startsWith("$2")) {
    // 已 hash：用 bcrypt.compare（constant-time）
    isValid = await bcrypt.compare(pin, storedPin);
  } else {
    // 舊版明文 PIN：比對後自動升級為 hash
    isValid = storedPin === pin;
    if (isValid) {
      const hash = await bcrypt.hash(pin, 10);
      await supabase.from("booths").update({ pin: hash, failed_attempts: 0, locked_until: null }).eq("id", booth.id);
    }
  }

  if (!isValid) {
    const attempts = (booth.failed_attempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;

    await supabase
      .from("booths")
      .update({ failed_attempts: attempts, ...(lockedUntil ? { locked_until: lockedUntil } : {}) })
      .eq("id", booth.id);

    const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
    const msg =
      remaining > 0
        ? `PIN 碼錯誤（還有 ${remaining} 次機會）`
        : `PIN 碼錯誤，帳號已鎖定 ${LOCK_MINUTES} 分鐘`;
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  // ── 成功：重置鎖定，設定簽名 cookie ──
  await supabase
    .from("booths")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("id", booth.id);

  const sig = await signBoothSession(booth.id, booth.name);

  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8, // 8 小時（縮短至安全範圍）
    path: "/",
  };

  const res = NextResponse.json({ success: true });
  res.cookies.set("booth_id", String(booth.id), opts);
  res.cookies.set("booth_name", booth.name, opts);
  res.cookies.set("booth_sig", sig, opts);
  return res;
}
