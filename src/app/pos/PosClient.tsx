"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { checkout, getTodayOrders, TodayOrder } from "./actions";
import { boothLogout } from "@/app/(auth)/login/actions";
import { downloadLabel } from "@/lib/label-utils";

type Booth = { id: number; name: string } | null;
type Props = {
  initialProducts: Product[];
  categories: { id: number; name: string }[];
  isAdmin: boolean;
  booth: Booth;
  userEmail: string | null;
  todayTotal: number;
  todayCount: number;
  todayCashTotal: number;
  todayLinePayTotal: number;
  linePayQrUrl: string;
};

const M = {
  bg:      "#F7F6F2",
  surface: "#FFFFFF",
  border:  "#E0E0E0",
  ink:     "#333333",
  mid:     "#888888",
  muted:   "#C4C4C4",
  danger:  "#C0392B",
  warm:    "#8C7355",
  disabled:"#E0E0E0",
  accent:  "#E91E63",
} as const;

const NOTO: React.CSSProperties = {
  fontFamily: "var(--font-noto, 'Noto Sans TC', system-ui, sans-serif)",
};

export default function PosClient({
  initialProducts,
  isAdmin,
  booth,
  userEmail,
  todayTotal: initTodayTotal,
  todayCount: initTodayCount,
  todayCashTotal: initTodayCashTotal,
  todayLinePayTotal: initTodayLinePayTotal,
  linePayQrUrl,
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [todayTotal, setTodayTotal] = useState(initTodayTotal);
  const [todayCount, setTodayCount] = useState(initTodayCount);
  const [todayCashTotal, setTodayCashTotal] = useState(initTodayCashTotal);
  const [todayLinePayTotal, setTodayLinePayTotal] = useState(initTodayLinePayTotal);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const [showTodaySales, setShowTodaySales] = useState(false);
  const [salesTab, setSalesTab] = useState<"orders" | "products">("orders");
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [todaySalesLoading, setTodaySalesLoading] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<"cash" | "linepay" | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLinePayQR, setShowLinePayQR] = useState(false);

  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [fallbackSearch, setFallbackSearch] = useState("");
  const [splitRatio, setSplitRatio] = useState(40);
  const [isDragging, setIsDragging] = useState(false);

  const mainAreaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startRatio: number } | null>(null);
  const scanControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef({ text: "", time: 0 });
  const handleScanResultRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  useEffect(() => {
    if (!scanMsg) return;
    const t = setTimeout(() => setScanMsg(null), 2500);
    return () => clearTimeout(t);
  }, [scanMsg]);

  // Camera scanner — always on, restarts on facing change
  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any = null;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mounted) return;

        scanner = new Html5Qrcode("html5-qrcode-region");
        scanControlsRef.current = {
          stop: () => scanner?.stop().then(() => scanner?.clear()).catch(() => {}),
        };

        await scanner.start(
          { facingMode: cameraFacing },
          {
            fps: 10,
            qrbox: { width: 220, height: 130 },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.EAN_13,
            ],
            videoConstraints: {
              facingMode: { ideal: cameraFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          },
          (decodedText: string) => {
            if (!mounted) return;
            handleScanResultRef.current(decodedText);
          },
          () => {}
        );
        if (mounted) setCameraPermissionDenied(false);
      } catch {
        if (mounted) setCameraPermissionDenied(true);
      }
    })();

    return () => {
      mounted = false;
      scanControlsRef.current?.stop();
      scanControlsRef.current = null;
    };
  }, [cameraFacing]);

  // Auto-add scan result with 2s same-SKU debounce
  handleScanResultRef.current = (text: string) => {
    const now = Date.now();
    const sku = text.trim();
    if (sku === lastScanRef.current.text && now - lastScanRef.current.time < 2000) return;
    lastScanRef.current = { text: sku, time: now };

    const product = products.find((p) => p.sku === sku);
    if (!product) { setScanMsg(`找不到 SKU：${sku}`); return; }
    if (product.stock <= 0) { setScanMsg(`「${product.name}」庫存不足`); return; }

    addToCart(product);
    setFlashItemId(product.id);
    setTimeout(() => setFlashItemId(null), 500);
  };

  function handleDividerPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startRatio: splitRatio };
    setIsDragging(true);
  }

  function handleDividerPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !mainAreaRef.current) return;
    const totalH = mainAreaRef.current.getBoundingClientRect().height;
    const dy = e.clientY - dragRef.current.startY;
    const next = dragRef.current.startRatio + (dy / totalH) * 100;
    setSplitRatio(Math.max(20, Math.min(75, next)));
  }

  function handleDividerPointerUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  async function openTodaySales() {
    setShowTodaySales(true);
    setTodaySalesLoading(true);
    try {
      const data = await getTodayOrders(booth?.id ?? null);
      setTodayOrders(data);
    } finally {
      setTodaySalesLoading(false);
    }
  }

  async function refreshProducts() {
    const supabase = createClient();
    const { data } = await supabase
      .from("products")
      .select("*, categories(id, name)")
      .eq("is_active", true)
      .order("name");
    if (data && data.length > 0) setProducts(data as Product[]);
  }

  function addToCart(product: Product) {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product: {
          id: product.id, name: product.name, price: product.price,
          image_url: product.image_url, stock: product.stock,
          low_stock_threshold: product.low_stock_threshold,
        },
        quantity: 1,
      }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const newQty = i.quantity + delta;
        if (newQty <= 0) return null;
        if (newQty > i.product.stock) return i;
        return { ...i, quantity: newQty };
      }).filter(Boolean) as CartItem[]
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function openPriceEdit(productId: string, currentPrice: number) {
    setEditingPriceId(productId);
    setPriceInput(String(currentPrice));
  }

  function numpadPress(val: string) {
    if (val === "C") { setPriceInput(""); return; }
    if (val === "⌫") { setPriceInput((p) => p.slice(0, -1)); return; }
    setPriceInput((p) => (p.length >= 6 ? p : p + val));
  }

  function confirmPriceEdit() {
    const newPrice = parseInt(priceInput, 10);
    if (editingPriceId && !isNaN(newPrice) && newPrice > 0) {
      setCart((prev) =>
        prev.map((i) =>
          i.product.id === editingPriceId ? { ...i, overridePrice: newPrice } : i
        )
      );
    }
    setEditingPriceId(null);
  }

  async function doCheckout(paymentMethod: "cash" | "linepay") {
    if (cart.length === 0) return;
    setCheckoutLoading(paymentMethod);
    setErrorMsg(null);
    try {
      await checkout(cart, paymentMethod);
      const orderTotal = cart.reduce(
        (s, i) => s + (i.overridePrice ?? i.product.price) * i.quantity, 0
      );
      setCart([]);
      setShowLinePayQR(false);
      setTodayTotal((t) => t + orderTotal);
      setTodayCount((c) => c + 1);
      if (paymentMethod === "cash") {
        setTodayCashTotal((t) => t + orderTotal);
      } else {
        setTodayLinePayTotal((t) => t + orderTotal);
      }
      setSuccessMsg(`結帳成功 · ${paymentMethod === "cash" ? "現金" : "LinePay"}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await refreshProducts();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setCheckoutLoading(null);
    }
  }

  const cartTotal = cart.reduce(
    (sum, i) => sum + (i.overridePrice ?? i.product.price) * i.quantity, 0
  );
  const isDisabled = cart.length === 0 || !!checkoutLoading;
  const displayName = booth?.name ?? userEmail?.split("@")[0] ?? "楊雪雪";

  const fallbackProducts = fallbackSearch.trim()
    ? products
        .filter((p) => {
          const q = fallbackSearch.toLowerCase();
          return (p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)) && p.stock > 0;
        })
        .slice(0, 8)
    : [];

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: M.bg, ...NOTO }}>
      <style>{`
        #html5-qrcode-region__dashboard { display: none !important; }
        #html5-qrcode-region video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
        #html5-qrcode-region canvas { display: none !important; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header
        className="flex-shrink-0 flex items-center gap-2 px-4"
        style={{ height: 48, background: M.surface, borderBottom: `1px solid ${M.border}` }}
      >
        <span className="flex-1 text-sm font-medium truncate" style={{ color: M.ink, letterSpacing: 1 }}>
          {displayName}
        </span>
        <button
          onClick={openTodaySales}
          className="flex-shrink-0 px-2 py-1 active:opacity-70 transition-opacity"
          style={{ background: M.bg, border: `1px solid ${M.border}`, borderRadius: 2 }}
        >
          <div className="text-xs leading-snug text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="font-semibold" style={{ color: M.ink }}>{todayCount}筆 ${todayTotal.toLocaleString()}</span>
            <br />
            <span style={{ color: M.muted, fontSize: 10 }}>💵{todayCashTotal.toLocaleString()} 📱{todayLinePayTotal.toLocaleString()}</span>
          </div>
        </button>
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            className="text-xs px-2 py-1.5 active:opacity-70 flex-shrink-0"
            style={{ background: M.bg, color: M.mid, border: `1px solid ${M.border}`, borderRadius: 2 }}
          >後台</Link>
        )}
        {booth && (
          <form action={boothLogout}>
            <button type="submit" className="text-xs px-2 py-1 active:opacity-70 flex-shrink-0" style={{ color: M.muted }}>
              登出
            </button>
          </form>
        )}
      </header>

      {/* ═══ TOAST ═══ */}
      {(successMsg || errorMsg) && (
        <div className="flex-shrink-0 px-3 pt-2">
          {successMsg && (
            <div className="px-3 py-2" style={{ background: M.surface, borderLeft: `3px solid ${M.ink}`, borderRadius: 2 }}>
              <span className="text-sm font-medium" style={{ color: M.ink }}>✓ {successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="px-3 py-2" style={{ background: M.surface, borderLeft: `3px solid ${M.danger}`, borderRadius: 2 }}>
              <span className="text-sm font-medium" style={{ color: M.danger }}>✗ {errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ SPLIT MAIN AREA ═══ */}
      <div ref={mainAreaRef} className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── CAMERA (upper) ── */}
        <div
          style={{
            flex: `0 0 ${splitRatio}%`,
            position: "relative",
            background: "#0f0f0f",
            overflow: "hidden",
            minHeight: 120,
          }}
        >
          {cameraPermissionDenied ? (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6"
              style={{ background: "#1a1a1a" }}
            >
              <div style={{ fontSize: 36 }}>📷</div>
              <div className="text-sm text-center" style={{ color: "#aaa", ...NOTO }}>請允許相機權限以使用掃描功能</div>
              <div className="w-full max-w-xs">
                <input
                  type="search"
                  value={fallbackSearch}
                  onChange={(e) => setFallbackSearch(e.target.value)}
                  placeholder="手動搜尋商品名稱或 SKU..."
                  className="w-full px-3 py-2.5 text-sm focus:outline-none"
                  style={{ background: "#2a2a2a", color: "#fff", border: "1px solid #444", borderRadius: 4, ...NOTO }}
                />
                {fallbackProducts.length > 0 && (
                  <div
                    className="mt-1 overflow-y-auto"
                    style={{ maxHeight: 160, background: "#222", borderRadius: 4, border: "1px solid #444" }}
                  >
                    {fallbackProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          addToCart(p);
                          setFlashItemId(p.id);
                          setTimeout(() => setFlashItemId(null), 500);
                          setFallbackSearch("");
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm active:opacity-70 transition-opacity"
                        style={{ color: "#fff", borderBottom: "1px solid #333", ...NOTO }}
                      >
                        {p.name}
                        <span className="ml-2 text-xs" style={{ color: "#888" }}>${p.price}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div id="html5-qrcode-region" className="absolute inset-0" />

              {/* Scan frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div style={{ width: 220, height: 130, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)", position: "relative" }}>
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2" style={{ borderColor: "#fff" }} />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2" style={{ borderColor: "#fff" }} />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2" style={{ borderColor: "#fff" }} />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2" style={{ borderColor: "#fff" }} />
                </div>
              </div>

              {/* Flip camera */}
              <button
                onClick={() => setCameraFacing((f) => f === "environment" ? "user" : "environment")}
                className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center active:opacity-60 transition-opacity"
                style={{ background: "rgba(255,255,255,0.15)", borderRadius: "50%", color: "#fff", fontSize: 18 }}
                aria-label="切換鏡頭"
              >
                🔄
              </button>

              {/* Scan status */}
              {scanMsg && (
                <div
                  className="absolute bottom-3 left-3 right-3 text-center text-sm py-2 px-3"
                  style={{
                    background: (scanMsg.startsWith("找不到") || scanMsg.includes("庫存")) ? M.danger : "rgba(255,255,255,0.15)",
                    color: "#fff",
                    borderRadius: 4,
                    ...NOTO,
                  }}
                >
                  {scanMsg}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── DRAGGABLE DIVIDER ── */}
        <div
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
          onPointerCancel={handleDividerPointerUp}
          style={{
            flex: "0 0 10px",
            background: isDragging ? M.border : M.bg,
            borderTop: `1px solid ${M.border}`,
            borderBottom: `1px solid ${M.border}`,
            cursor: "ns-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <div style={{ width: 36, height: 4, background: M.muted, borderRadius: 2 }} />
        </div>

        {/* ── CART (lower) ── */}
        <div style={{ flex: "1 1 0", overflowY: "auto", background: M.bg }}>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center" style={{ height: "100%", color: M.muted }}>
              <div style={{ fontSize: 40 }}>📷</div>
              <div className="text-sm mt-2" style={{ ...NOTO }}>請掃描商品</div>
            </div>
          ) : (
            <>
              {/* Cart header */}
              <div
                className="flex items-center justify-between px-4"
                style={{ height: 40, borderBottom: `1px solid ${M.border}`, background: M.surface, position: "sticky", top: 0, zIndex: 1 }}
              >
                <span className="text-xs font-medium" style={{ color: M.mid }}>
                  {cart.reduce((s, i) => s + i.quantity, 0)} 件
                </span>
                <button
                  onClick={() => setCart([])}
                  className="text-xs active:opacity-50 transition-opacity"
                  style={{ color: M.muted }}
                >清空</button>
              </div>

              {/* Items */}
              {cart.map((item, idx) => {
                const effectivePrice = item.overridePrice ?? item.product.price;
                const isOverride = item.overridePrice !== undefined;
                return (
                  <div
                    key={item.product.id}
                    className="px-3 py-3"
                    style={{
                      background: flashItemId === item.product.id ? "#d1fae5" : M.surface,
                      transition: "background 500ms ease-out",
                      borderBottom: idx < cart.length - 1 ? `1px solid ${M.border}` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 flex-shrink-0 overflow-hidden" style={{ background: M.bg, borderRadius: 2 }}>
                        {item.product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: M.muted, fontSize: 10 }}>
                            {item.product.name.slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: M.ink }}>{item.product.name}</span>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-11 h-11 flex items-center justify-center text-xl flex-shrink-0 active:opacity-50 transition-opacity"
                        style={{ color: M.muted }}
                      >×</button>
                    </div>
                    <div className="flex items-center gap-2 pl-10">
                      <button
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-11 h-11 flex items-center justify-center font-bold text-xl active:scale-90 transition-all"
                        style={{ background: M.bg, border: `1px solid ${M.border}`, color: M.ink, borderRadius: 2 }}
                      >−</button>
                      <span className="w-8 text-center font-bold text-base" style={{ color: M.ink }}>{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product.id, 1)}
                        className="w-11 h-11 flex items-center justify-center font-bold text-xl active:scale-90 transition-all"
                        style={{ background: M.bg, border: `1px solid ${M.border}`, color: M.ink, borderRadius: 2 }}
                      >+</button>
                      <button
                        onClick={() => openPriceEdit(item.product.id, effectivePrice)}
                        className="px-2 py-1 text-sm active:scale-95 transition-transform"
                        style={
                          isOverride
                            ? { border: `1px solid ${M.warm}`, background: "#F5F0E8", color: M.warm, borderRadius: 2 }
                            : { border: `1px solid ${M.border}`, color: M.mid, borderRadius: 2 }
                        }
                      >
                        ${effectivePrice}{isOverride && " *"}
                      </button>
                      <span className="ml-auto font-bold text-sm" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>
                        ${(effectivePrice * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div style={{ height: 12 }} />
            </>
          )}
        </div>
      </div>

      {/* ═══ 底部結帳列 ═══ */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: M.surface, borderTop: `1px solid ${M.border}` }}
      >
        <div className="flex-shrink-0 min-w-0">
          <div className="text-xs leading-none mb-0.5" style={{ color: M.muted }}>總計</div>
          <div className="font-bold leading-tight" style={{ color: M.accent, fontSize: 28, fontVariantNumeric: "tabular-nums" }}>
            ${cartTotal.toLocaleString()}
          </div>
        </div>
        <button
          onClick={() => doCheckout("cash")}
          disabled={isDisabled}
          className="flex-1 font-semibold py-4 text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
          style={{
            background: isDisabled ? M.disabled : M.ink,
            color: isDisabled ? M.muted : "#FFFFFF",
            borderRadius: 2,
            letterSpacing: 0.5,
          }}
        >
          {checkoutLoading === "cash" ? "處理中..." : "💵 現金"}
        </button>
        <button
          onClick={() => { if (cart.length > 0) setShowLinePayQR(true); }}
          disabled={isDisabled}
          className="flex-1 font-semibold py-4 text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
          style={{
            background: M.surface,
            color: isDisabled ? M.muted : M.ink,
            border: `1px solid ${isDisabled ? M.border : M.ink}`,
            borderRadius: 2,
            letterSpacing: 0.5,
          }}
        >
          💳 LinePay
        </button>
      </div>

      {/* ═══ 改價數字鍵盤 ═══ */}
      {editingPriceId && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(51,51,51,0.4)" }}>
          <div className="w-full p-4" style={{ background: M.surface, borderRadius: "2px 2px 0 0" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold" style={{ color: M.ink }}>修改單價</div>
              <button
                onClick={() => setEditingPriceId(null)}
                className="w-11 h-11 flex items-center justify-center text-2xl active:opacity-60 transition-opacity"
                style={{ color: M.muted }}
              >×</button>
            </div>
            <div
              className="px-4 py-3 text-right text-3xl font-bold mb-4"
              style={{ background: M.bg, color: M.ink, borderRadius: 2, fontVariantNumeric: "tabular-nums" }}
            >
              ${priceInput || "0"}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                <button
                  key={k}
                  onClick={() => numpadPress(k)}
                  className="py-4 text-xl font-bold active:scale-95 transition-transform"
                  style={
                    k === "C"  ? { background: "#FEE2E2", color: "#DC2626", borderRadius: 2 } :
                    k === "⌫" ? { background: M.bg, color: M.warm, border: `1px solid ${M.border}`, borderRadius: 2 } :
                    { background: M.bg, color: M.ink, border: `1px solid ${M.border}`, borderRadius: 2 }
                  }
                >{k}</button>
              ))}
            </div>
            <button
              onClick={confirmPriceEdit}
              className="w-full font-semibold py-4 text-lg active:opacity-90 transition-opacity"
              style={{ background: M.ink, color: "#fff", borderRadius: 2 }}
            >確認</button>
          </div>
        </div>
      )}

      {/* ═══ LinePay QR Modal ═══ */}
      {showLinePayQR && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: M.surface }}>
          <div
            className="flex items-center justify-between px-4 py-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${M.border}` }}
          >
            <div className="font-bold text-xl" style={{ color: M.ink, letterSpacing: 1 }}>LinePay 付款</div>
            <button
              onClick={() => setShowLinePayQR(false)}
              className="w-11 h-11 flex items-center justify-center text-2xl active:opacity-60 transition-opacity"
              style={{ color: M.muted }}
            >×</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            <div className="text-sm" style={{ color: M.mid }}>請掃描 QR Code 完成付款</div>
            <div className="p-4" style={{ background: M.bg, borderRadius: 2 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={linePayQrUrl}
                alt="LinePay QR"
                className="w-64 h-64 object-contain"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = "none";
                  const next = img.nextElementSibling as HTMLElement | null;
                  if (next) next.style.display = "flex";
                }}
              />
              <div style={{ display: "none" }} className="w-64 h-64 flex-col items-center justify-center text-center">
                <div className="text-sm mb-1" style={{ color: M.mid }}>尚未設定 QR Code</div>
                <div className="text-xs" style={{ color: M.muted }}>請至後台 LinePay 設定上傳</div>
              </div>
            </div>
            <div className="font-bold" style={{ color: M.ink, fontSize: 40, fontVariantNumeric: "tabular-nums" }}>
              ${cartTotal.toLocaleString()}
            </div>
          </div>
          <div className="px-4 pb-8 flex-shrink-0">
            <button
              onClick={() => doCheckout("linepay")}
              disabled={!!checkoutLoading}
              className="w-full font-semibold py-5 text-xl active:opacity-90 transition-opacity disabled:opacity-60"
              style={{ background: M.ink, color: "#fff", borderRadius: 2, letterSpacing: 1 }}
            >
              {checkoutLoading === "linepay" ? "結帳中..." : "✓ 已收款，完成結帳"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ 今日銷售明細 ═══ */}
      {showTodaySales && (() => {
        const productMap: Record<string, { product_id: string; product_name: string; unit_price: number; total_qty: number; sku: string | null }> = {};
        todayOrders.forEach((order) => {
          order.items.forEach((item) => {
            if (productMap[item.product_id]) {
              productMap[item.product_id].total_qty += item.quantity;
            } else {
              productMap[item.product_id] = {
                product_id: item.product_id, product_name: item.product_name,
                unit_price: item.unit_price, total_qty: item.quantity, sku: item.sku,
              };
            }
          });
        });
        const todayProducts = Object.values(productMap).sort((a, b) => b.total_qty - a.total_qty);

        return (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ background: M.surface }}>
            <div className="flex items-center justify-between px-4 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${M.border}` }}>
              <div className="font-bold text-lg" style={{ color: M.ink }}>今日銷售明細</div>
              <button onClick={() => setShowTodaySales(false)} className="w-11 h-11 flex items-center justify-center text-2xl active:opacity-60 transition-opacity" style={{ color: M.muted }}>×</button>
            </div>
            <div className="flex flex-shrink-0" style={{ borderBottom: `1px solid ${M.border}` }}>
              {(["orders", "products"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSalesTab(tab)}
                  className="flex-1 py-3 text-sm font-medium transition-colors"
                  style={{
                    color: salesTab === tab ? M.ink : M.muted,
                    borderBottom: salesTab === tab ? `2px solid ${M.ink}` : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  {tab === "orders" ? "訂單明細" : `商品 & 標籤${todayProducts.length > 0 ? `（${todayProducts.length}）` : ""}`}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {todaySalesLoading ? (
                <div className="text-center py-16 text-sm" style={{ color: M.muted }}>載入中...</div>
              ) : todayOrders.length === 0 ? (
                <div className="text-center py-16" style={{ color: M.muted }}>
                  <div className="mb-2" style={{ fontSize: 36, color: M.border }}>—</div>
                  <div className="text-sm">今日尚未有銷售紀錄</div>
                </div>
              ) : salesTab === "orders" ? (
                <div className="space-y-3">
                  {todayOrders.map((order) => (
                    <div key={order.id} style={{ background: M.bg, borderRadius: 4, overflow: "hidden" }}>
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${M.border}` }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono" style={{ color: M.mid }}>#{order.id}</span>
                          <span className="text-xs" style={{ color: M.muted }}>{order.time}</span>
                        </div>
                        {order.payment_method === "cash" ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>💵 現金</span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "#d1fae5", color: "#065f46" }}>📱 LINE PAY</span>
                        )}
                      </div>
                      <div className="px-4 py-2 space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate" style={{ color: M.ink }}>{item.product_name}</div>
                              <div className="text-xs" style={{ color: M.muted }}>${item.unit_price.toLocaleString()} × {item.quantity} 件</div>
                            </div>
                            <div className="text-sm font-semibold flex-shrink-0" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>${item.subtotal.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center px-4 py-2" style={{ borderTop: `1px solid ${M.border}` }}>
                        <span className="text-xs" style={{ color: M.muted }}>小計</span>
                        <span className="text-sm font-bold" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>${order.total.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {todayProducts.map((p) => (
                    <div key={p.product_id} className="flex items-center gap-3 px-4 py-3" style={{ background: M.bg, borderRadius: 4 }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: M.ink }}>{p.product_name}</div>
                        <div className="text-xs mt-0.5" style={{ color: M.muted }}>
                          ${p.unit_price.toLocaleString()}
                          {p.sku ? <span className="ml-2">SKU: {p.sku}</span> : <span className="ml-2">未設定 SKU</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: M.mid }}>今日賣出 <span className="font-semibold">{p.total_qty}</span> 件</div>
                      </div>
                      {p.sku ? (
                        <button
                          onClick={() => downloadLabel({ sku: p.sku, name: p.product_name, price: p.unit_price })}
                          className="flex-shrink-0 text-xs font-medium px-4 active:opacity-70 transition-opacity flex items-center justify-center"
                          style={{ height: 44, minWidth: 72, background: M.surface, color: M.warm, border: `1px solid ${M.border}`, borderRadius: 2 }}
                        >下載標籤</button>
                      ) : (
                        <div className="flex-shrink-0 text-xs flex items-center justify-center" style={{ height: 44, minWidth: 72, color: M.muted, border: `1px dashed ${M.border}`, borderRadius: 2 }}>無 SKU</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 pb-6 pt-3 flex-shrink-0 space-y-1.5" style={{ borderTop: `1px solid ${M.border}` }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: M.mid }}>💵 現金</span>
                <span className="font-bold" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>${todayCashTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: M.mid }}>📱 LINE PAY</span>
                <span className="font-bold" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>${todayLinePayTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm pt-1.5" style={{ borderTop: `1px solid ${M.border}` }}>
                <span style={{ color: M.mid }}>共 {todayOrders.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0)} 件・總計</span>
                <span className="font-bold" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>${todayTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
