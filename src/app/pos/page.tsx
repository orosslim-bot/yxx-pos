import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-6xl mb-4">🧶</div>
        <h1 className="text-3xl font-bold text-gray-800">楊雪雪針織小舖 POS</h1>
        <p className="text-gray-500 mt-2">Sprint 2 即將上線 — 商品管理 & 結帳功能</p>
        <p className="text-xs text-gray-400 mt-6">登入帳號：{user.email}</p>
      </div>
    </div>
  );
}
