"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { checkout } from "./actions";
import { boothLogout } from "@/app/(auth)/login/actions";

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

  // Price edit
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  // Checkout
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLinePayQR, setShowLinePayQR] = useState(false);

  // QR Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef({ text: "", time: 0 });
  const handleScanResultRef = useRef<(text: string) => void>(() => {});

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
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            image_url: product.image_url,
            stock: product.stock,
            low_stock_threshold: product.low_stock_threshold,
          },
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const newQty = i.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > i.product.stock) return i;
          return { ...i, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
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
          i.product.id === editingPriceId
            ? { ...i, overridePrice: newPrice }
            : i
        )
      );
    }
    setEditingPriceId(null);
  }

  handleScanResultRef.current = (text: string) => {
    const now = Date.now();
    const sku = text.trim();
    if (
      sku === lastScanRef.current.text &&
      now - lastScanRef.current.time < 2500
    )
      return;
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
          undefined,
          videoRef.current,
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
    setCheckoutLoading(true);
    setErrorMsg(null);
    try {
      await checkout(cart, paymentMethod);
      const orderTotal = cart.reduce(
        (s, i) => s + (i.overridePrice ?? i.product.price) * i.quantity,
        0
      );
      setCart([]);
      setShowLinePayQR(false);
      setTodayTotal((t) => t + orderTotal);
      setTodayCount((c) => c + 1);
      setSuccessMsg(
        `結帳成功 💰 ${paymentMethod === "cash" ? "現金" : "LinePay"}`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      await refreshProducts();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const cartTotal = cart.reduce(
    (sum, i) => sum + (i.overridePrice ?? i.product.price) * i.quantity,
    0
  );
  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category_id === activeCategory);
  const displayName = booth?.name ?? userEmail?.split("@")[0] ?? "楊雪雪";

  return (
    <div className="h-dvh flex flex-col bg-gray-50 overflow-hidden">
      {/* Top Bar */}
      <header className="bg-white border-b px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span className="text-base">🧶</span>
          <span className="font-bold text-gray-800 text-sm truncate">{displayName}</span>
        </div>
        <button
          onClick={() => { setScanMsg(null); lastScanRef.current = { text: "", time: 0 }; setShowScanner(true); }}
          className="flex items-center gap-1 bg-gray-800 text-white text-sm font-bold px-3 py-2 rounded-lg flex-shrink-0"
        >
          <span>📷</span><span className="hidden sm:inline">掃描</span>
        </button>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400 leading-none">今日業績</p>
          <p className="text-xs font-bold text-pink-600">{todayCount}筆/${todayTotal.toLocaleString()}</p>
        </div>
        {isAdmin && (
          <Link href="/admin/dashboard" className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex-shrink-0">後台</Link>
        )}
        {booth && (
          <form action={boothLogout}>
            <button type="submit" className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">登出</button>
          </form>
        )}
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {(successMsg || errorMsg) && (
          <div className="px-3 pt-2">
            {successMsg && (
              <div className="bg-green-100 border border-green-300 text-green-800 px-3 py-2 rounded-xl text-sm text-center">{successMsg}</div>
            )}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm text-center">❌ {errorMsg}</div>
            )}
          </div>
        )}

        {/* Cart Section */}
        {cart.length > 0 && (
          <div className="mx-3 mt-2 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b bg-pink-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-pink-700">
                購物車（{cart.reduce((s, i) => s + i.quantity, 0)} 件）
              </span>
              <button onClick={() => setCart([])} className="text-xs text-red-400">清空</button>
            </div>
            <div className="divide-y">
              {cart.map((item) => {
                const effectivePrice = item.overridePrice ?? item.product.price;
                const isOverride = item.overridePrice !== undefined;
                return (
                  <div key={item.product.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-9 h-9 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {item.product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">🧶</div>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{item.product.name}</span>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 text-xl leading-none w-6 text-center flex-shrink-0">×</button>
                    </div>
                    <div className="flex items-center gap-2 pl-11">
                      <button onClick={() => updateQty(item.product.id, -1)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xl text-gray-700">−</button>
                      <span className="w-8 text-center font-bold text-base">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product.id, 1)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xl text-gray-700">+</button>
                      <button
                        onClick={() => openPriceEdit(item.product.id, effectivePrice)}
                        className={`px-2 py-1 rounded-lg text-sm border ${isOverride ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600"}`}
                      >
                        ${effectivePrice}{isOverride && " ✏️"}
                      </button>
                      <span className="ml-auto font-bold text-pink-600 text-sm">${(effectivePrice * item.quantity).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto">
          {[{ id: "all" as const, name: "全部" }, ...categories].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as number | "all")}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex-shrink-0 font-medium ${
                activeCategory === cat.id ? "bg-pink-500 text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
            >{cat.name}</button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-1">
          {filteredProducts.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id);
            const isOut = product.stock <= 0;
            const isLow = product.stock > 0 && product.stock <= product.low_stock_threshold;
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={isOut}
                className={`relative bg-white rounded-xl shadow-sm overflow-hidden text-left active:scale-95 transition-transform ${isOut ? "opacity-40 cursor-not-allowed" : ""} ${inCart ? "ring-2 ring-pink-400" : ""}`}
              >
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🧶</div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{product.name}</div>
                  <div className="text-pink-600 font-bold mt-1 text-sm">${product.price}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className={`text-xs ${isLow ? "text-red-500" : "text-gray-400"}`}>庫存{product.stock}</span>
                    {inCart && (
                      <span className="bg-pink-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{inCart.quantity}</span>
                    )}
                  </div>
                </div>
                {isLow && !isOut && <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded-full">低</div>}
                {isOut && <div className="absolute top-1 left-1 bg-gray-400 text-white text-xs px-1 py-0.5 rounded-full">缺</div>}
              </button>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-sm">此分類沒有商品</p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="bg-white border-t px-3 py-2.5 flex-shrink-0 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 leading-none">總計</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight">${cartTotal.toLocaleString()}</p>
          </div>
          <button
            onClick={() => doCheckout("cash")}
            disabled={cart.length === 0 || checkoutLoading}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm"
          >💵 現金</button>
          <button
            onClick={() => { if (cart.length > 0) setShowLinePayQR(true); }}
            disabled={cart.length === 0 || checkoutLoading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-sm"
          >📱 LinePay</button>
        </div>
      </div>

      {/* Price Edit Numpad */}
      {editingPriceId && (
        <div className="fixed inset-0 z-50 flex items-end bg-black bg-opacity-50">
          <div className="w-full bg-white rounded-t-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">修改單價（殺價）</h3>
              <button onClick={() => setEditingPriceId(null)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="bg-gray-100 rounded-xl px-4 py-3 text-right text-3xl font-bold text-gray-800 mb-4">
              ${priceInput || "0"}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                <button
                  key={k}
                  onClick={() => numpadPress(k)}
                  className={`py-4 rounded-xl text-xl font-bold ${
                    k === "C" ? "bg-red-100 text-red-600" :
                    k === "⌫" ? "bg-orange-100 text-orange-600" :
                    "bg-gray-100 text-gray-800"
                  }`}
                >{k}</button>
              ))}
            </div>
            <button onClick={confirmPriceEdit} className="w-full bg-pink-500 text-white font-bold py-4 rounded-xl text-lg">確認</button>
          </div>
        </div>
      )}

      {/* LinePay QR Modal */}
      {showLinePayQR && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b">
            <h2 className="font-bold text-xl">LinePay 付款</h2>
            <button onClick={() => setShowLinePayQR(false)} className="text-gray-400 text-2xl">×</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            <p className="text-gray-500 text-sm">請掃描 QR Code 完成付款</p>
            <div className="bg-gray-50 rounded-2xl p-4">
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
              <div style={{ display: "none" }} className="w-64 h-64 flex-col items-center justify-center text-center text-gray-400">
                <div className="text-4xl mb-2">📱</div>
                <p className="text-sm">尚未設定 QR Code</p>
                <p className="text-xs">請至後台 LinePay 設定上傳</p>
              </div>
            </div>
            <p className="text-4xl font-bold text-green-600">${cartTotal.toLocaleString()}</p>
          </div>
          <div className="px-4 pb-8">
            <button
              onClick={() => doCheckout("linepay")}
              disabled={checkoutLoading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-bold py-5 rounded-2xl text-xl"
            >{checkoutLoading ? "結帳中..." : "✅ 已收款，完成結帳"}</button>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
            <div>
              <h2 className="text-white font-bold text-lg">掃描商品 QR Code</h2>
              <p className="text-gray-400 text-xs mt-0.5">將 QR Code 對準框框內</p>
            </div>
            <button
              onClick={() => { scanControlsRef.current?.stop(); scanControlsRef.current = null; setShowScanner(false); setScanMsg(null); }}
              className="w-9 h-9 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-white text-xl"
            >×</button>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-56 h-56">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-pink-400 opacity-80 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 px-5 py-5 min-h-[80px] flex items-center justify-center">
            {scanMsg ? (
              <div className={`w-full text-center px-4 py-3 rounded-xl font-medium text-sm ${
                scanMsg.startsWith("✅") ? "bg-green-500 text-white" :
                scanMsg.startsWith("❌") ? "bg-red-500 text-white" :
                "bg-white bg-opacity-20 text-white"
              }`}>{scanMsg}</div>
            ) : (
              <p className="text-gray-500 text-sm text-center">等待掃描中...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
