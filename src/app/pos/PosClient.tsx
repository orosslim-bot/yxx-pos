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

// 字型快捷 style
const F_PLAYFAIR = { fontFamily: "var(--font-playfair, Georgia, serif)" } as const;
const F_OUTFIT   = { fontFamily: "var(--font-outfit, system-ui, sans-serif)" } as const;

// 色票
const C = {
  bg:      "#F7F3ED",
  card:    "#FFFFFF",
  border:  "#EDE5D8",
  border2: "#D5C9BC",
  terra:   "#A8522A",  // 陶土棕（主色）
  sage:    "#4A7A4E",  // 苔蘚綠（現金）
  amber:   "#B07828",  // 琥珀棕（低庫存）
  ink:     "#1E1A16",  // 墨色（主文字）
  mid:     "#6B6257",  // 暖灰中（次文字）
  light:   "#9E9388",  // 暖灰淡（說明）
  hover:   "#F2EAE0",  // 陶土 hover
  disabled:"#C8C2BB",
} as const;

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

  const [showTodaySales, setShowTodaySales] = useState(false);
  const [todaySales, setTodaySales] = useState<TodaySaleItem[]>([]);
  const [todaySalesLoading, setTodaySalesLoading] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState<"cash" | "linepay" | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLinePayQR, setShowLinePayQR] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef({ text: "", time: 0 });
  const handleScanResultRef = useRef<(text: string) => void>(() => {});

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
    setProducts((data as Product[]) ?? []);
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
    const now = Date.now();
    const sku = text.trim();
    if (sku === lastScanRef.current.text && now - lastScanRef.current.time < 2500) return;
    lastScanRef.current = { text: sku, time: now };
    const product = products.find((p) => p.sku === sku);
    if (!product) { setScanMsg(`❓ 找不到 SKU：${sku}`); return; }
    if (product.stock <= 0) { setScanMsg(`❌「${product.name}」庫存不足`); return; }
    addToCart(product);
    setScanMsg(`✅ 已加入：${product.name}（$${product.price}）`);
  };

  useEffect(() => {
    if (!showScanner) return;
    let mounted = true;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (!mounted || !videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(
          undefined, videoRef.current,
          (result: unknown) => {
            if (!mounted || !result) return;
            const text = (result as { getText: () => string }).getText();
            handleScanResultRef.current(text);
          }
        );
        scanControlsRef.current = controls as { stop: () => void };
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
  };

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ background: C.bg, ...F_OUTFIT }}
    >
      {/* ═══ HEADER ═══ */}
      <header style={{ background: C.card, borderBottom: `1px solid ${C.border}` }} className="flex-shrink-0">
        <div className="px-4 py-2.5 flex items-center gap-2">
          {/* 攤位名稱 */}
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-medium truncate block"
              style={{ color: C.ink, ...F_PLAYFAIR, fontStyle: "italic" }}
            >
              {displayName}
            </span>
          </div>

          {/* 桌機掃描 */}
          <button
            onClick={scanOpen}
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-2 rounded-md active:scale-95 transition-all flex-shrink-0"
            style={{ background: C.bg, color: C.terra, border: `1px solid ${C.border}` }}
          >
            <span>📷</span><span>掃描</span>
          </button>

          {/* 今日業績 */}
          <button
            onClick={openTodaySales}
            className="flex-shrink-0 px-3 py-1.5 rounded-md text-right active:scale-95 transition-all"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}
          >
            <div className="text-xs leading-none" style={{ color: C.light }}>今日業績</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: C.terra, ...F_PLAYFAIR }}>
              {todayCount}筆・${todayTotal.toLocaleString()}
            </div>
          </button>

          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="text-xs px-2 py-1.5 rounded-md active:scale-95 transition-all flex-shrink-0"
              style={{ background: C.bg, color: C.mid, border: `1px solid ${C.border}` }}
            >後台</Link>
          )}
          {booth && (
            <form action={boothLogout}>
              <button
                type="submit"
                className="text-xs px-2 py-1 rounded-md active:opacity-70 transition-opacity flex-shrink-0"
                style={{ color: C.light }}
              >登出</button>
            </form>
          )}
        </div>

        {/* 手機：大掃描按鈕 */}
        <div className="sm:hidden px-4 pb-3">
          <button
            onClick={scanOpen}
            className="w-full font-medium py-3.5 rounded-md text-sm flex items-center justify-center gap-2 active:scale-[0.98] active:opacity-90 transition-all"
            style={{ background: C.terra, color: "#fff" }}
          >
            <span>📷</span>
            <span>掃描條碼</span>
          </button>
        </div>
      </header>

      {/* ═══ TOAST ═══ */}
      {(successMsg || errorMsg) && (
        <div className="flex-shrink-0 px-4 pt-2 pb-0.5">
          {successMsg && (
            <div
              className="px-4 py-2.5 rounded-r-lg shadow-sm flex items-center gap-2"
              style={{ background: C.card, borderLeft: `4px solid ${C.sage}` }}
            >
              <span className="text-sm font-medium" style={{ color: C.sage }}>✓ {successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div
              className="px-4 py-2.5 rounded-r-lg shadow-sm"
              style={{ background: C.card, borderLeft: "4px solid #C0392B" }}
            >
              <span className="text-sm font-medium" style={{ color: "#C0392B" }}>✗ {errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ 搜尋 + 分類（固定，不捲動） ═══ */}
      <div
        className="flex-shrink-0"
        style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}
      >
        {/* 搜尋欄 */}
        <div className="px-4 pt-3 pb-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋商品名稱或 SKU..."
            className="w-full px-4 py-2.5 rounded-md text-sm focus:outline-none transition-all"
            style={{
              background: C.bg,
              color: C.ink,
              border: `1px solid ${C.border}`,
            }}
            onFocus={(e) => { e.target.style.borderColor = C.terra; }}
            onBlur={(e)  => { e.target.style.borderColor = C.border; }}
          />
        </div>

        {/* 分類 Tab */}
        <div className="relative">
          <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {[{ id: "all" as const, name: "全部" }, ...categories].map((cat) => {
              const active = activeCategory === (cat.id as number | "all");
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id as number | "all")}
                  className="px-3 py-1.5 rounded-md text-sm whitespace-nowrap flex-shrink-0 font-medium active:scale-95 transition-all"
                  style={
                    active
                      ? { background: C.terra, color: "#fff", border: `1px solid ${C.terra}` }
                      : { background: "transparent", color: C.mid, border: `1px solid ${C.border2}` }
                  }
                >{cat.name}</button>
              );
            })}
          </div>
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8"
            style={{ background: `linear-gradient(to left, ${C.card}, transparent)` }}
          />
        </div>
      </div>

      {/* ═══ 捲動區域：購物車 + 商品 ═══ */}
      <div className="flex-1 overflow-y-auto">

        {/* 購物車 */}
        {cart.length > 0 && (
          <div
            className="mx-3 mt-3 rounded-lg overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            {/* 購物車標題 */}
            <div
              className="px-4 py-2.5 flex items-center"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              <span className="text-sm font-medium flex-1" style={{ color: C.mid }}>
                購物車（{cartQty} 件）
              </span>
              <span
                className="font-bold mr-3"
                style={{ color: C.terra, fontSize: 15, ...F_PLAYFAIR }}
              >
                ${cartTotal.toLocaleString()}
              </span>
              <button
                onClick={() => setCart([])}
                className="text-sm px-3 py-1 rounded-md active:opacity-60 transition-opacity min-w-[44px] flex items-center"
                style={{ color: C.light }}
              >清空</button>
            </div>

            {/* 購物車品項 */}
            <div>
              {cart.map((item, idx) => {
                const effectivePrice = item.overridePrice ?? item.product.price;
                const isOverride = item.overridePrice !== undefined;
                return (
                  <div
                    key={item.product.id}
                    className="px-3 py-2.5"
                    style={idx < cart.length - 1 ? { borderBottom: `1px solid ${C.border}` } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0" style={{ background: C.bg }}>
                        {item.product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">🧶</div>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: C.ink }}>{item.product.name}</span>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-11 h-11 flex items-center justify-center rounded-md active:opacity-50 transition-opacity text-xl flex-shrink-0"
                        style={{ color: C.light }}
                      >×</button>
                    </div>
                    <div className="flex items-center gap-2 pl-11">
                      <button
                        onClick={() => updateQty(item.product.id, -1)}
                        className="w-11 h-11 rounded-md flex items-center justify-center font-bold text-xl active:scale-90 transition-all"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink }}
                      >−</button>
                      <span className="w-8 text-center font-bold text-base" style={{ color: C.ink }}>{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product.id, 1)}
                        className="w-11 h-11 rounded-md flex items-center justify-center font-bold text-xl active:scale-90 transition-all"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.ink }}
                      >+</button>
                      <button
                        onClick={() => openPriceEdit(item.product.id, effectivePrice)}
                        className="px-2 py-1 rounded-md text-sm active:scale-95 transition-transform"
                        style={
                          isOverride
                            ? { border: `1px solid ${C.amber}`, background: "#FDF3E3", color: C.amber }
                            : { border: `1px solid ${C.border}`, color: C.mid }
                        }
                      >
                        ${effectivePrice}{isOverride && " ✏️"}
                      </button>
                      <span
                        className="ml-auto font-bold text-sm"
                        style={{ color: C.terra, ...F_PLAYFAIR }}
                      >
                        ${(effectivePrice * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 商品格 */}
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-3">
          {filteredProducts.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id);
            const isOut = product.stock <= 0;
            const isLow = product.stock > 0 && product.stock <= product.low_stock_threshold;

            return (
              <div
                key={product.id}
                className="relative rounded-lg overflow-hidden flex flex-col transition-all"
                style={{
                  background: C.card,
                  border: inCart
                    ? `1px solid ${C.terra}`
                    : `1px solid ${C.border}`,
                  opacity: isOut ? 0.45 : 1,
                  boxShadow: inCart ? `0 0 0 2px ${C.terra}22` : undefined,
                }}
              >
                {/* 加入購物車 */}
                <button
                  onClick={() => addToCart(product)}
                  disabled={isOut}
                  className="flex-1 text-left active:scale-[0.97] transition-all disabled:cursor-not-allowed"
                >
                  <div className="aspect-square overflow-hidden" style={{ background: C.bg }}>
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">🧶</div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium line-clamp-2 leading-snug" style={{ color: C.ink }}>
                      {product.name}
                    </div>
                    <div
                      className="font-bold mt-1.5"
                      style={{ color: C.terra, fontSize: 15, ...F_PLAYFAIR }}
                    >
                      ${product.price}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: isLow ? C.amber : C.light }}>
                        {isLow ? `⚠ ${product.stock}` : `庫存 ${product.stock}`}
                      </span>
                      {inCart && (
                        <span
                          className="text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold"
                          style={{ background: C.terra, color: "#fff" }}
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
                      color: C.terra,
                      background: C.hover + "66",
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    🏷 標籤
                  </button>
                )}

                {/* 低庫存/缺貨 badge */}
                {isLow && !isOut && (
                  <div
                    className="absolute top-1.5 left-1.5 text-white text-xs px-1.5 py-0.5 rounded"
                    style={{ background: C.amber, fontSize: 10 }}
                  >低</div>
                )}
                {isOut && (
                  <div
                    className="absolute top-1.5 left-1.5 text-white text-xs px-1.5 py-0.5 rounded"
                    style={{ background: C.light, fontSize: 10 }}
                  >缺貨</div>
                )}
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-12" style={{ color: C.light }}>
              <div className="text-4xl mb-2">📭</div>
              <div className="text-sm">此分類沒有商品</div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 底部結帳列 ═══ */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ background: C.card, borderTop: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-xs leading-none mb-0.5" style={{ color: C.light }}>總計</div>
            <div
              className="font-bold leading-tight"
              style={{ color: C.ink, fontSize: 28, ...F_PLAYFAIR }}
            >
              ${cartTotal.toLocaleString()}
            </div>
          </div>
          <button
            onClick={() => doCheckout("cash")}
            disabled={cart.length === 0 || !!checkoutLoading}
            className="flex-1 font-semibold py-4 rounded-md text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
            style={{
              background: cart.length === 0 || !!checkoutLoading ? C.disabled : C.sage,
              color: cart.length === 0 || !!checkoutLoading ? C.light : "#fff",
            }}
          >
            {checkoutLoading === "cash" ? "處理中..." : "💵 現金"}
          </button>
          <button
            onClick={() => { if (cart.length > 0) setShowLinePayQR(true); }}
            disabled={cart.length === 0 || !!checkoutLoading}
            className="flex-1 font-semibold py-4 rounded-md text-sm active:scale-[0.97] active:opacity-90 transition-all disabled:cursor-not-allowed"
            style={{
              background: cart.length === 0 || !!checkoutLoading ? C.disabled : C.terra,
              color: cart.length === 0 || !!checkoutLoading ? C.light : "#fff",
            }}
          >
            📱 LinePay
          </button>
        </div>
      </div>

      {/* ═══ 改價數字鍵盤 ═══ */}
      {editingPriceId && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div className="w-full rounded-t-2xl p-4" style={{ background: C.card }}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold" style={{ color: C.ink }}>修改單價</div>
              <button
                onClick={() => setEditingPriceId(null)}
                className="w-11 h-11 flex items-center justify-center rounded-md text-2xl active:opacity-60 transition-opacity"
                style={{ color: C.light }}
              >×</button>
            </div>
            <div
              className="rounded-lg px-4 py-3 text-right text-3xl font-bold mb-4"
              style={{ background: C.bg, color: C.ink, ...F_PLAYFAIR }}
            >
              ${priceInput || "0"}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                <button
                  key={k}
                  onClick={() => numpadPress(k)}
                  className="py-4 rounded-lg text-xl font-bold active:scale-95 transition-transform"
                  style={
                    k === "C"  ? { background: "#FEE2E2", color: "#DC2626" } :
                    k === "⌫" ? { background: "#FEF3C7", color: C.amber } :
                    { background: C.bg, color: C.ink }
                  }
                >{k}</button>
              ))}
            </div>
            <button
              onClick={confirmPriceEdit}
              className="w-full font-semibold py-4 rounded-lg text-lg active:opacity-90 transition-opacity"
              style={{ background: C.terra, color: "#fff" }}
            >確認</button>
          </div>
        </div>
      )}

      {/* ═══ LinePay QR Modal ═══ */}
      {showLinePayQR && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: C.card }}>
          <div
            className="flex items-center justify-between px-4 py-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="font-bold text-xl" style={{ color: C.ink, ...F_PLAYFAIR }}>LinePay 付款</div>
            <button
              onClick={() => setShowLinePayQR(false)}
              className="w-11 h-11 flex items-center justify-center rounded-md text-2xl active:opacity-60 transition-opacity"
              style={{ color: C.light }}
            >×</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            <div className="text-sm" style={{ color: C.mid }}>請掃描 QR Code 完成付款</div>
            <div className="rounded-2xl p-4" style={{ background: C.bg }}>
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
                <div className="text-4xl mb-2">📱</div>
                <div className="text-sm" style={{ color: C.light }}>尚未設定 QR Code</div>
                <div className="text-xs mt-1" style={{ color: C.light }}>請至後台 LinePay 設定上傳</div>
              </div>
            </div>
            <div className="font-bold" style={{ color: C.sage, fontSize: 40, ...F_PLAYFAIR }}>
              ${cartTotal.toLocaleString()}
            </div>
          </div>
          <div className="px-4 pb-8 flex-shrink-0">
            <button
              onClick={() => doCheckout("linepay")}
              disabled={!!checkoutLoading}
              className="w-full font-semibold py-5 rounded-xl text-xl active:opacity-90 transition-opacity disabled:opacity-60"
              style={{ background: C.terra, color: "#fff" }}
            >
              {checkoutLoading === "linepay" ? "結帳中..." : "✓ 已收款，完成結帳"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ 今日銷售明細 ═══ */}
      {showTodaySales && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: C.card }}>
          <div
            className="flex items-center justify-between px-4 py-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="font-bold text-lg" style={{ color: C.ink }}>今日銷售明細</div>
            <button
              onClick={() => setShowTodaySales(false)}
              className="w-11 h-11 flex items-center justify-center rounded-md text-2xl active:opacity-60 transition-opacity"
              style={{ color: C.light }}
            >×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {todaySalesLoading ? (
              <div className="text-center py-16 text-sm" style={{ color: C.light }}>載入中...</div>
            ) : todaySales.length === 0 ? (
              <div className="text-center py-16" style={{ color: C.light }}>
                <div className="text-4xl mb-2">📭</div>
                <div className="text-sm">今日尚未有銷售紀錄</div>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySales.map((item) => {
                  const product = products.find((p) => p.id === item.product_id);
                  return (
                    <div
                      key={item.product_id}
                      className="rounded-lg px-4 py-3 flex items-center gap-3"
                      style={{ background: C.bg }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: C.ink }}>{item.product_name}</div>
                        <div className="text-xs mt-0.5" style={{ color: C.mid }}>
                          ${item.unit_price} × {item.quantity} 件 ＝
                          <span className="font-bold ml-1" style={{ color: C.terra }}>
                            ${(item.unit_price * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <div className="text-xl font-bold" style={{ color: C.ink, ...F_PLAYFAIR }}>{item.quantity}</div>
                        <div className="text-xs" style={{ color: C.light }}>件</div>
                      </div>
                      {product?.sku && (
                        <button
                          onClick={() => downloadLabel(product)}
                          className="flex-shrink-0 text-xs font-medium px-3 py-2.5 rounded-lg active:opacity-70 transition-opacity min-h-[44px] flex items-center"
                          style={{ background: C.hover + "66", color: C.terra, border: `1px solid ${C.border}` }}
                        >
                          🏷 標籤
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className="px-4 pb-6 pt-3 flex-shrink-0"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <div className="text-sm text-center" style={{ color: C.mid }}>
              共 {todaySales.reduce((s, i) => s + i.quantity, 0)} 件 ·
              總計{" "}
              <span className="font-bold" style={{ color: C.terra, ...F_PLAYFAIR }}>
                ${todaySales.reduce((s, i) => s + i.unit_price * i.quantity, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ QR 掃描器 ═══ */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
            <div>
              <div className="font-bold text-lg" style={{ color: "#fff", ...F_OUTFIT }}>掃描商品條碼</div>
              <div className="text-xs mt-0.5" style={{ color: "#9ca3af", ...F_OUTFIT }}>將 QR Code 對準框框內</div>
            </div>
            <button
              onClick={scanClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl active:opacity-60 transition-opacity"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >×</button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-56 h-56">
                {/* 掃描框角落 — 陶土棕 */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg" style={{ borderColor: C.terra }} />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg" style={{ borderColor: C.terra }} />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg" style={{ borderColor: C.terra }} />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg" style={{ borderColor: C.terra }} />
                {/* 掃描線 */}
                <div
                  className="absolute inset-x-0 top-1/2 h-0.5 opacity-80 animate-pulse"
                  style={{ background: C.terra }}
                />
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 px-5 py-5 min-h-[80px] flex items-center justify-center">
            {scanMsg ? (
              <div
                className="w-full text-center px-4 py-3 rounded-xl font-medium text-sm"
                style={{
                  background: scanMsg.startsWith("✅") ? C.sage :
                               scanMsg.startsWith("❌") ? "#C0392B" :
                               "rgba(255,255,255,0.15)",
                  color: "#fff",
                  ...F_OUTFIT,
                }}
              >{scanMsg}</div>
            ) : (
              <div className="text-sm text-center" style={{ color: "#6b7280", ...F_OUTFIT }}>等待掃描中...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
