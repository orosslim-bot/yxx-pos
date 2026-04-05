"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("帳號或密碼錯誤，請重試");
      setLoading(false);
    } else {
      router.push("/pos");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm px-6">
      {/* Logo 區 */}
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">🧶</div>
        <h1 className="text-2xl font-bold text-gray-800">楊雪雪針織小舖</h1>
        <p className="text-gray-500 mt-1 text-sm">行動收銀系統</p>
      </div>

      {/* 登入表單 */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            電子郵件
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="請輸入 Email"
            className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            密碼
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="請輸入密碼"
            className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-bold py-4 px-6 rounded-xl text-lg transition-colors"
        >
          {loading ? "登入中..." : "登入"}
        </button>
      </form>
    </div>
  );
}
