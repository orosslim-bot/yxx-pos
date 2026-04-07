import { createClient } from "@/lib/supabase/server";

/**
 * 驗證目前請求者為 admin，否則丟出錯誤。
 * 用於所有 admin server action 的開頭，防止繞過 layout 直接呼叫。
 */
export async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登入");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("無權限：需要管理員身份");
}
