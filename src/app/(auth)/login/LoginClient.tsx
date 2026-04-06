"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Booth = { id: number; name: string };

export default function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"booth" | "boss">("booth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [booths, setBooths] = useState<Booth[]>([]);
  const [boothName, setBoothName] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("booths")
      .select("id, name")
      .order("id")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setBooths(data);
          setBoothName(data[0].name);
        }
      });
  }, []);

  async function handleBossLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("帳號或密碼錯誤");
      setLoading(false);
    } else {
      router.push("/pos");
      router.refresh();
    }
  }

  async function handleBoothLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4) { setError("請輸入 4 位 PIN 碼"); return; }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/booth-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booth_name: boothName, pin }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      setError(result.error ?? "登入失敗");
      setLoading(false);
    } else {
      router.push("/pos");
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
        <button
          onClick={() => { setMode("booth"); setError(null); }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === "booth" ? "bg-pink-500 text-white" : "bg-white text-gray-600"
          }`}
        >
          攤位登入
        </button>
        <button
          onClick={() => { setMode("boss"); setError(null); }}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === "boss" ? "bg-gray-800 text-white" : "bg-white text-gray-600"
          }`}
        >
          老闆登入
        </button>
      </div>

      {mode === "booth" ? (
        <form onSubmit={handleBoothLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇攤位</label>
            <select
              value={boothName}
              onChange={(e) => setBoothName(e.target.value)}
              className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
            >
              {booths.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN 碼（4 位數字）</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="w-full px-4 py-4 text-2xl text-center tracking-[0.5em] border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-bold py-4 rounded-xl text-lg"
          >
            {loading ? "登入中..." : "進入收銀台"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBossLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-4 rounded-xl text-lg"
          >
            {loading ? "登入中..." : "老闆登入"}
          </button>
        </form>
      )}
    </div>
  );
}
