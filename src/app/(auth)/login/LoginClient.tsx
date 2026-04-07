"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Booth = { id: number; name: string };

const M = {
  bg:      "#F7F6F2",
  border:  "#E0E0E0",
  ink:     "#333333",
  mid:     "#888888",
  muted:   "#C4C4C4",
  hover:   "#EEEDE9",
  danger:  "#C0392B",
} as const;

const NOTO: React.CSSProperties = {
  fontFamily: "var(--font-noto, 'Noto Sans TC', system-ui, sans-serif)",
};

export default function LoginClient() {
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
      window.location.href = "/pos";
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
      window.location.href = "/pos";
    }
  }

  const tabBase: React.CSSProperties = {
    ...NOTO,
    flex: 1,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 400,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  };

  const inputStyle: React.CSSProperties = {
    ...NOTO,
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    border: `1px solid ${M.border}`,
    borderRadius: 2,
    background: "#FFFFFF",
    color: M.ink,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    ...NOTO,
    display: "block",
    fontSize: 12,
    color: M.mid,
    marginBottom: 6,
    letterSpacing: 0.5,
  };

  const primaryBtn: React.CSSProperties = {
    ...NOTO,
    width: "100%",
    padding: "16px 0",
    fontSize: 15,
    fontWeight: 500,
    background: loading ? M.muted : M.ink,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 2,
    cursor: loading ? "not-allowed" : "pointer",
    letterSpacing: 1,
    transition: "background 0.15s",
  };

  return (
    <div style={{ ...NOTO }}>
      {/* Tab switcher */}
      <div style={{ display: "flex", borderBottom: `1px solid ${M.border}`, marginBottom: 28 }}>
        <button
          onClick={() => { setMode("booth"); setError(null); }}
          style={{
            ...tabBase,
            color: mode === "booth" ? M.ink : M.mid,
            borderBottom: mode === "booth" ? `2px solid ${M.ink}` : "2px solid transparent",
          }}
        >
          攤位登入
        </button>
        <button
          onClick={() => { setMode("boss"); setError(null); }}
          style={{
            ...tabBase,
            color: mode === "boss" ? M.ink : M.mid,
            borderBottom: mode === "boss" ? `2px solid ${M.ink}` : "2px solid transparent",
          }}
        >
          老闆登入
        </button>
      </div>

      {mode === "booth" ? (
        <form onSubmit={handleBoothLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <span style={labelStyle}>選擇攤位</span>
            <select
              value={boothName}
              onChange={(e) => setBoothName(e.target.value)}
              style={{ ...inputStyle, fontSize: 16 }}
            >
              {booths.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>PIN 碼（4 位數字）</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              style={{ ...inputStyle, fontSize: 24, textAlign: "center", letterSpacing: "0.5em" }}
            />
          </div>
          {error && (
            <div style={{ ...NOTO, background: "#FDF2F2", border: `1px solid #E8BBBB`, color: M.danger, padding: "12px 16px", borderRadius: 2, fontSize: 13 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={primaryBtn}>
            {loading ? "登入中..." : "進入收銀台"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBossLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <span style={labelStyle}>電子郵件</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="請輸入 Email"
              style={inputStyle}
            />
          </div>
          <div>
            <span style={labelStyle}>密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="請輸入密碼"
              style={inputStyle}
            />
          </div>
          {error && (
            <div style={{ ...NOTO, background: "#FDF2F2", border: `1px solid #E8BBBB`, color: M.danger, padding: "12px 16px", borderRadius: 2, fontSize: 13 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={primaryBtn}>
            {loading ? "登入中..." : "老闆登入"}
          </button>
        </form>
      )}
    </div>
  );
}
