export const dynamic = 'force-dynamic';

import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm px-6">
      <div className="text-center mb-10">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            border: "1.5px solid #333333",
            marginBottom: 16,
            fontFamily: "var(--font-noto, system-ui, sans-serif)",
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 300, letterSpacing: 1, color: "#333333" }}>Y</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 500, color: "#333333", letterSpacing: 2, fontFamily: "var(--font-noto, system-ui, sans-serif)" }}>
          楊雪雪針織小舖
        </div>
        <div style={{ fontSize: 12, color: "#888888", marginTop: 4, letterSpacing: 1, fontFamily: "var(--font-noto, system-ui, sans-serif)" }}>
          行動收銀系統
        </div>
      </div>
      <LoginClient />
    </div>
  );
}
