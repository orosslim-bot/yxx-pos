"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { checkout, getTodaySales, TodaySaleItem } from "./actions";
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
  linePayQrUrl: string;
};

// MUJI 色票
const M = {
  bg:      "#F7F6F2",
  surface: "#FFFFFF",
  border:  "#E0E0E0",
  ink:     "#333333",
  mid:     "#888888",
  muted:   "#C4C4C4",
  hover:   "#EEEDE9",
  danger:  "#C0392B",
  warm:    "#8C7355",
  disabled:"#E0E0E0",
} as const;

const NOTO: React.CSSProperties = {
  fontFamily: "var(--font-noto, 'Noto Sans TC', system-ui, sans-serif)",
};

export default function PosClient({
  initialProducts,
  categories,
  isAdmin,
  booth,
  userEmail,
  todayTotal: initTodayTotal,
  todayCount: initTodayCount,
  linePayQrUrl,
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [todayTotal, setTodayTotal] = useState(initTodayTotal);
  const [todayCount, setTodayCount] = useState(initTodayCount);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  // 購物車收合狀態
  const [cartExpanded, setCartExpanded] = useState(false);
  const prevCartLengthRef = useRef(0);

  const [showTodaySales, setShowTodaySales] = useState(false);
  const [todaySales, setTodaySales] = useState<TodaySaleItem[]>([]);
  const [todaySalesLoading, setTodaySalesLoading] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<"cash" | "linepay" | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLinePayQR, setShowLinePayQR] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [pendingScan, setPendingScan] = useState<{ product: Product } | null>(null);
  const scanControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef({ text: "", time: 0 });
  const scanPausedRef = useRef(false);
  const handleScanResultRef = useRef<(text: string) => void>(() => {});

  // 購物車自動收合邏輯
  useEffect(() => {
    const prev = prevCartLengthRef.current;
    const curr = cart.length;
    if (curr === 0) {
      setCartExpanded(false);
    } else if (prev === 0 && curr === 1) {
      setCartExpanded(true);
    } else if (prev < 3 && curr >= 3) {
      setCartExpanded(false);
    }
    prevCartLengthRef.current = curr;
  }, [cart.length]);

  // Auto-dismiss error 6s
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  // Auto-dismiss scan msg 2.5s
  useEffect(() => {
    if (!scanMsg) return;
    const t = setTimeout(() => setScanMsg(null), 2500);
    return () => clearTimeout(t);
  }, [scanMsg]);

  async function openTodaySales() {
    setShowTodaySales(true);
    setTodaySalesLoading(true);
    try {
      const data = await getTodaySales(booth?.id ?? null);
      setTodaySales(data);
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
    // 只有確實拿到資料才更新，避免 RLS/網路問題清空商品列表
    if (data && data.length > 0) {
      setProducts(data as Product[]);
    }
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

  handleScanResultRef.current = (text: string) => {
    if (scanPausedRef.current) return; // 等待確認中，忽略新掃描
    const now = Date.now();
    const sku = text.trim();
    if (sku === lastScanRef.current.text && now - lastScanRef.current.time < 1500) return;
    lastScanRef.current = { text: sku, time: now };
    const product = products.find((p) => p.sku === sku);
    if (!product) { setScanMsg(`找不到 SKU：${sku}`); return; }
    if (product.stock <= 0) { setScanMsg(`「${product.name}」庫存不足`); return; }
    // 暫停掃描，等待使用者確認
    scanPausedRef.current = true;
    setScanMsg(null);
    setPendingScan({ product });
  };

  function confirmScan() {
    if (pendingScan) addToCart(pendingScan.product);
    setPendingScan(null);
    scanPausedRef.current = false;
    lastScanRef.current = { text: "", time: 0 };
  }

  function cancelScan() {
    setPendingScan(null);
    scanPausedRef.current = false;
    lastScanRef.current = { text: "", time: 0 };
  }

  useEffect(() => {
    if (!showScanner) return;
    let mounted = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any = null;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!mounted) return;

        scanner = new Html5Qrcode("html5-qrcode-region");
        scanControlsRef.current = {
          stop: () => {
            scanner?.stop().then(() => scanner?.clear()).catch(() => {});
          },
        };

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.EAN_13,
            ],
            // facingMode 必須放在 videoConstraints 內，否則 html5-qrcode 會忽略第一個參數
            // 移除 advanced focusMode，iOS Safari 不支援會導致 getUserMedia 失敗
            videoConstraints: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          },
          (decodedText: string) => {
            if (!mounted) return;
            handleScanResultRef.current(decodedText);
          },
          () => {} // 掃描 miss，忽略
        );
      } catch {
        if (mounted) setScanMsg("無法啟動相機，請確認已允許相機權限");
      }
    })();

    return () => {
      mounted = false;
      scanControlsRef.current?.stop();
      scanControlsRef.current = null;
    };
  }, [showScanner]);

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
  const cartQty = cart.reduce((s, i) => s + i.quantity, 0);

  const filteredProducts = (
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category_id === activeCategory)
  )
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.stock === 0 && b.stock > 0) return 1;
      if (b.stock === 0 && a.stock > 0) return -1;
      const skuA = a.sku ?? "", skuB = b.sku ?? "";
      if (skuA && skuB) return skuA.localeCompare(skuB, undefined, { numeric: true });
      if (skuA && !skuB) return -1;
      if (!skuA && skuB) return 1;
      return a.name.localeCompare(b.name);
    });

  const displayName = booth?.name ?? userEmail?.split("@")[0] ?? "楊雪雪";

  const scanOpen = () => {
    setScanMsg(null);
    lastScanRef.current = { text: "", time: 0 };
    setShowScanner(true);
  };
  const scanClose = () => {
    scanControlsRef.current?.stop();
    scanControlsRef.current = null;
    setShowScanner(false);
    setScanMsg(null);
    setPendingScan(null);
    scanPausedRef.current = false;
  };

  const isDisabled = cart.length === 0 || !!checkoutLoading;

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ background: M.bg, ...NOTO }}
    >
      {/* ═══ HEADER ═══ */}
      <header style={{ background: M.surface, borderBottom: `1px solid ${M.border}` }} className="flex-shrink-0">
        <div className="px-4 py-2.5 flex items-center gap-2">
          {/* 攤位名稱 */}
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-medium truncate block"
              style={{ color: M.ink, letterSpacing: 1 }}
            >
              {displayName}
            </span>
          </div>

          {/* 桌機掃描 */}
          <button
            onClick={scanOpen}
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-2 active:opacity-70 transition-opacity flex-shrink-0"
            style={{ background: M.bg, color: M.mid, border: `1px solid ${M.border}`, borderRadius: 2 }}
          >
            <span>掃描</span>
          </button>

          {/* 今日業績 */}
          <button
            onClick={openTodaySales}
            className="flex-shrink-0 px-3 py-1.5 text-right active:opacity-70 transition-opacity"
            style={{ background: M.bg, border: `1px solid ${M.border}`, borderRadius: 2 }}
          >
            <div className="text-xs leading-none" style={{ color: M.muted }}>今日業績</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>
              {todayCount}筆・${todayTotal.toLocaleString()}
            </div>
          </button>

          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="text-xs px-2 py-1.5 active:opacity-70 transition-opacity flex-shrink-0"
              style={{ background: M.bg, color: M.mid, border: `1px solid ${M.border}`, borderRadius: 2 }}
            >後台</Link>
          )}
          {booth && (
            <form action={boothLogout}>
              <button
                type="submit"
                className="text-xs px-2 py-1 active:opacity-70 transition-opacity flex-shrink-0"
                style={{ color: M.muted }}
              >登出</button>
            </form>
          )}
        </div>

        {/* 手機：大掃描按鈕 */}
        <div className="sm:hidden px-4 pb-3">
          <button
            onClick={scanOpen}
            className="w-full font-medium py-3.5 text-sm flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: M.ink, color: "#fff", borderRadius: 2, letterSpacing: 1 }}
          >
            掃描條碼
          </button>
        </div>
      </header>

      {/* ═══ TOAST ═══ */}
      {(successMsg || errorMsg) && (
        <div className="flex-shrink-0 px-4 pt-2 pb-0.5">
          {successMsg && (
            <div
              className="px-4 py-2.5 flex items-center gap-2"
              style={{ background: M.surface, borderLeft: `3px solid ${M.ink}`, borderRadius: 2 }}
            >
              <span className="text-sm font-medium" style={{ color: M.ink }}>✓ {successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div
              className="px-4 py-2.5"
              style={{ background: M.surface, borderLeft: `3px solid ${M.danger}`, borderRadius: 2 }}
            >
              <span className="text-sm font-medium" style={{ color: M.danger }}>✗ {errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ 搜尋 + 分類（固定，不捲動） ═══ */}
      <div
        className="flex-shrink-0"
        style={{ background: M.surface, borderBottom: `1px solid ${M.border}` }}
      >
        {/* 搜尋欄 */}
        <div className="px-4 pt-3 pb-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋商品名稱或 SKU..."
            className="w-full px-4 py-2.5 text-sm focus:outline-none transition-all"
            style={{
              background: M.bg,
              color: M.ink,
              border: `1px solid ${M.border}`,
              borderRadius: 2,
              ...NOTO,
            }}
            onFocus={(e) => { e.target.style.borderColor = M.ink; }}
            onBlur={(e)  => { e.target.style.borderColor = M.border; }}
          />
        </div>

        {/* 分類 Tab — 下底線樣式 */}
        <div className="relative">
          <div
            className="flex overflow-x-auto"
            style={{ borderBottom: `1px solid ${M.border}`, scrollbarWidth: "none" }}
          >
            {[{ id: "all" as const, name: "全部" }, ...categories].map((cat) => {
              const active = activeCategory === (cat.id as number | "all");
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id as number | "all")}
                  className="px-4 py-2.5 text-sm whitespace-nowrap flex-shrink-0 active:opacity-70 transition-all"
                  style={{
                    ...NOTO,
                    color: active ? M.ink : M.mid,
                    fontWeight: active ? 500 : 400,
                    borderBottom: active ? `2px solid ${M.ink}` : "2px solid transparent",
                    background: "transparent",
                    marginBottom: -1,
                  }}
                >{cat.name}</button>
              );
            })}
          </div>
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8"
            style={{ background: `linear-gradient(to left, ${M.surface}, transparent)` }}
          />
        </div>
      </div>

      {/* ═══ 購物車（可收合條） ═══ */}
      {cart.length > 0 && (
        <div
          className="flex-shrink-0 mx-3 mt-2 overflow-hidden"
          style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 2 }}
        >
          {/* ── 摘要列：永遠 48px，點擊展開/收合 ── */}
          <div className="flex items-center px-4" style={{ height: 48 }}>
            <button
              onClick={() => setCartExpanded((v) => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 h-full active:opacity-70 transition-opacity"
            >
              <span className="font-medium text-sm" style={{ color: M.mid }}>{cartQty} 件</span>
              <span style={{ color: M.border, fontSize: 12 }}>·</span>
              <span className="font-bold" style={{ color: M.ink, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
                ${cartTotal.toLocaleString()}
              </span>
              <span className="text-xs ml-0.5" style={{ color: M.muted }}>
                {cartExpanded ? "▲" : "▼"}
              </span>
            </button>
            <button
              onClick={() => setCart([])}
              className="h-11 px-3 flex items-center text-xs active:opacity-50 transition-opacity"
              style={{ color: M.muted }}
            >清空</button>
          </div>

          {/* ── 展開區域：200ms smooth ── */}
          <div
            style={{
              maxHeight: cartExpanded ? "50vh" : 0,
              overflow: "hidden",
              transition: "max-height 200ms ease-out",
            }}
          >
            <div style={{ height: 1, background: M.border }} />
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {cart.map((item, idx) => {
                const effectivePrice = item.overridePrice ?? item.product.price;
                const isOverride = item.overridePrice !== undefined;
                return (
                  <div
                    key={item.product.id}
                    className="px-3 py-2.5"
                    style={idx < cart.length - 1 ? { borderBottom: `1px solid ${M.border}` } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 overflow-hidden flex-shrink-0" style={{ background: M.bg, borderRadius: 2 }}>
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
                    <div className="flex items-center gap-2 pl-11">
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
                      <span
                        className="ml-auto font-bold text-sm"
                        style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}
                      >
                        ${(effectivePrice * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 捲動區域：只有商品格 ═══ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-3">
          {filteredProducts.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id);
            const isOut = product.stock <= 0;
            const isLow = product.stock > 0 && product.stock <= product.low_stock_threshold;

            return (
              <div
                key={product.id}
                className="relative overflow-hidden flex flex-col transition-all"
                style={{
                  background: M.surface,
                  border: `1px solid ${M.border}`,
                  borderLeft: inCart ? `2px solid ${M.ink}` : `1px solid ${M.border}`,
                  borderRadius: 2,
                  opacity: isOut ? 0.45 : 1,
                }}
              >
                {/* 加入購物車 */}
                <button
                  onClick={() => addToCart(product)}
                  disabled={isOut}
                  className="flex-1 text-left active:scale-[0.97] transition-all disabled:cursor-not-allowed"
                >
                  <div className="aspect-square overflow-hidden" style={{ background: M.bg }}>
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: M.muted, fontSize: 22, fontWeight: 300 }}>
                        {product.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium line-clamp-2 leading-snug" style={{ color: M.ink }}>
                      {product.name}
                    </div>
                    <div
                      className="font-bold mt-1.5"
                      style={{ color: M.ink, fontSize: 15, fontVariantNumeric: "tabular-nums" }}
                    >
                      ${product.price}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: isLow ? M.warm : M.muted }}>
                        {isLow ? `⚠ ${product.stock}` : `庫存 ${product.stock}`}
                      </span>
                      {inCart && (
                        <span
                          className="text-xs w-5 h-5 flex items-center justify-center font-bold"
                          style={{ background: M.ink, color: "#fff", borderRadius: 2, fontSize: 11 }}
                        >
                          {inCart.quantity}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* QR 標籤 */}
                {product.sku && (
                  <button
                    onClick={() => downloadLabel(product)}
                    className="w-full text-xs font-medium active:opacity-70 transition-opacity min-h-[34px] flex items-center justify-center"
                    style={{
                      color: M.mid,
                      background: M.bg,
                      borderTop: `1px solid ${M.border}`,
                      letterSpacing: 0.5,
                    }}
                  >
                    標籤
                  </button>
                )}

                {/* 低庫存/缺貨 badge */}
                {isLow && !isOut && (
                  <div
                    className="absolute top-1.5 left-1.5 text-xs px-1.5 py-0.5"
                    style={{ background: M.warm, color: "#fff", borderRadius: 2, fontSize: 10 }}
                  >低</div>
                )}
                {isOut && (
                  <div
                    className="absolute top-1.5 left-1.5 text-xs px-1.5 py-0.5"
                    style={{ background: M.muted, color: "#fff", borderRadius: 2, fontSize: 10 }}
                  >缺貨</div>
                )}
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-12" style={{ color: M.muted }}>
              <div className="text-sm mb-1" style={{ fontSize: 32, color: M.border }}>—</div>
              <div className="text-sm">此分類沒有商品</div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 底部結帳列 ═══ */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ background: M.surface, borderTop: `1px solid ${M.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-xs leading-none mb-0.5" style={{ color: M.muted }}>總計</div>
            <div
              className="font-bold leading-tight"
              style={{ color: M.ink, fontSize: 28, fontVariantNumeric: "tabular-nums" }}
            >
              ${cartTotal.toLocaleString()}
            </div>
          </div>
          {/* 現金 — 黑底白字 */}
          <button
            onClick={() => doCheckout("cash")}
            disabled={isDisabled}
            className="flex-1 font-semibold py-4 text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
            style={{
              background: isDisabled ? M.disabled : M.ink,
              color: isDisabled ? M.muted : "#FFFFFF",
              borderRadius: 2,
              letterSpacing: 1,
            }}
          >
            {checkoutLoading === "cash" ? "處理中..." : "現金"}
          </button>
          {/* LinePay — 白底黑框 */}
          <button
            onClick={() => { if (cart.length > 0) setShowLinePayQR(true); }}
            disabled={isDisabled}
            className="flex-1 font-semibold py-4 text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
            style={{
              background: "#FFFFFF",
              color: isDisabled ? M.muted : M.ink,
              border: `1px solid ${isDisabled ? M.border : M.ink}`,
              borderRadius: 2,
              letterSpacing: 1,
            }}
          >
            LinePay
          </button>
        </div>
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
              <div
                style={{ display: "none" }}
                className="w-64 h-64 flex-col items-center justify-center text-center"
              >
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
      {showTodaySales && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: M.surface }}>
          <div
            className="flex items-center justify-between px-4 py-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${M.border}` }}
          >
            <div className="font-bold text-lg" style={{ color: M.ink }}>今日銷售明細</div>
            <button
              onClick={() => setShowTodaySales(false)}
              className="w-11 h-11 flex items-center justify-center text-2xl active:opacity-60 transition-opacity"
              style={{ color: M.muted }}
            >×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {todaySalesLoading ? (
              <div className="text-center py-16 text-sm" style={{ color: M.muted }}>載入中...</div>
            ) : todaySales.length === 0 ? (
              <div className="text-center py-16" style={{ color: M.muted }}>
                <div className="text-sm mb-2" style={{ fontSize: 36, color: M.border }}>—</div>
                <div className="text-sm">今日尚未有銷售紀錄</div>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySales.map((item) => (
                  <div
                    key={item.product_id}
                    className="px-4 py-3 flex items-center gap-3"
                    style={{ background: M.bg, borderRadius: 2 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: M.ink }}>{item.product_name}</div>
                      <div className="text-xs mt-0.5" style={{ color: M.mid }}>
                        ${item.unit_price} × {item.quantity} 件 ＝
                        <span className="font-bold ml-1" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>
                          ${(item.unit_price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <div className="text-xl font-bold" style={{ color: M.ink }}>{item.quantity}</div>
                      <div className="text-xs" style={{ color: M.muted }}>件</div>
                    </div>
                    {item.sku && (
                      <button
                        onClick={() => downloadLabel({ sku: item.sku, name: item.product_name, price: item.unit_price })}
                        className="flex-shrink-0 text-xs font-medium px-3 py-2.5 active:opacity-70 transition-opacity min-h-[44px] flex items-center"
                        style={{ background: M.surface, color: M.mid, border: `1px solid ${M.border}`, borderRadius: 2 }}
                      >
                        標籤
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="px-4 pb-6 pt-3 flex-shrink-0"
            style={{ borderTop: `1px solid ${M.border}` }}
          >
            <div className="text-sm text-center" style={{ color: M.mid }}>
              共 {todaySales.reduce((s, i) => s + i.quantity, 0)} 件 ·
              總計{" "}
              <span className="font-bold" style={{ color: M.ink, fontVariantNumeric: "tabular-nums" }}>
                ${todaySales.reduce((s, i) => s + i.unit_price * i.quantity, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 條碼掃描器 ═══ */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(15,15,15,0.97)" }}>
          {/* 隱藏 html5-qrcode 原生 UI */}
          <style>{`
            #html5-qrcode-region video {
              width: 100% !important; height: 100% !important;
              object-fit: cover !important;
              position: absolute !important; top: 0 !important; left: 0 !important;
            }
            #html5-qrcode-region__scan_region { width: 100% !important; height: 100% !important; }
            #html5-qrcode-region__dashboard { display: none !important; }
            .qr-shaded-region { display: none !important; }
          `}</style>

          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
            <div>
              <div className="font-bold text-lg" style={{ color: "#fff", ...NOTO }}>掃描商品條碼</div>
              <div className="text-xs mt-0.5" style={{ color: "#6b7280", ...NOTO }}>將條形碼對準框框內</div>
            </div>
            <button
              onClick={scanClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl active:opacity-60 transition-opacity"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >×</button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {/* html5-qrcode 容器 */}
            <div id="html5-qrcode-region" className="absolute inset-0" />

            {/* MUJI overlay：遮罩 + 角落定位框 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative"
                style={{
                  width: 250,
                  height: 150,
                  // box-shadow 向外擴散模擬四周遮罩
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.52)",
                }}
              >
                {/* 四個角落，白色極細線 */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t border-l" style={{ borderColor: "#ffffff" }} />
                <div className="absolute top-0 right-0 w-5 h-5 border-t border-r" style={{ borderColor: "#ffffff" }} />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b border-l" style={{ borderColor: "#ffffff" }} />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b border-r" style={{ borderColor: "#ffffff" }} />
                {/* 靜態定位線，極細灰色，無動畫 */}
                <div className="absolute inset-x-0" style={{ top: "50%", height: 1, background: "#333333" }} />
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 px-5 py-4">
            {pendingScan ? (
              /* 確認列：掃描成功，等待使用者確認 */
              <div
                className="w-full px-4 py-3"
                style={{ background: "rgba(255,255,255,0.12)", borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)" }}
              >
                <div className="text-sm font-medium mb-1" style={{ color: "#fff", ...NOTO }}>
                  {pendingScan.product.name}
                </div>
                <div className="text-xs mb-3" style={{ color: "#9ca3af", ...NOTO }}>
                  定價 ${pendingScan.product.price}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelScan}
                    className="flex-1 py-2.5 text-sm font-medium active:opacity-60 transition-opacity"
                    style={{ background: "rgba(255,255,255,0.1)", color: "#9ca3af", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", ...NOTO }}
                  >取消</button>
                  <button
                    onClick={confirmScan}
                    className="flex-[2] py-2.5 text-sm font-bold active:opacity-80 transition-opacity"
                    style={{ background: "#fff", color: "#111", borderRadius: 2, ...NOTO }}
                  >確認加入購物車</button>
                </div>
              </div>
            ) : scanMsg ? (
              /* 錯誤訊息 */
              <div
                className="w-full text-center px-4 py-3 text-sm font-medium"
                style={{ background: "#C0392B", color: "#fff", borderRadius: 2, ...NOTO }}
              >{scanMsg}</div>
            ) : (
              <div className="text-sm text-center py-3" style={{ color: "#6b7280", ...NOTO }}>等待掃描中...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
