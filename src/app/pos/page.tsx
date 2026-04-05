"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Product, CartItem } from "@/lib/types";
import { checkout } from "./actions";

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>(
    []
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [showCart, setShowCart] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "linepay">(
    "cash"
  );
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const [{ data: prods }, { data: cats }, { data: authData }] =
        await Promise.all([
          supabase
            .from("products")
            .select("*, categories(id, name)")
            .eq("is_active", true)
            .order("name"),
          supabase.from("categories").select("*").order("id"),
          supabase.auth.getUser(),
        ]);

      setProducts((prods as Product[]) ?? []);
      setCategories(cats ?? []);

      const user = authData.user;
      if (user) {
        setUserEmail(user.email ?? "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setIsAdmin(profile?.role === "admin");
      }
    }

    load();
  }, []);

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

  async function handleCheckout() {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    setErrorMsg(null);

    try {
      await checkout(cart, paymentMethod);
      setCart([]);
      setShowCart(false);
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
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category_id === activeCategory);

  return (
    <div className="h-dvh flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧶</span>
          <span className="font-bold text-gray-800 text-sm sm:text-base">
            楊雪雪針織小舖
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin/products"
              className="text-xs sm:text-sm text-gray-500 hover:text-pink-500 bg-gray-100 px-2 py-1 rounded"
            >
              後台
            </Link>
          )}
          <span className="text-xs text-gray-400 hidden sm:block">
            {userEmail}
          </span>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="bg-white border-b px-3 py-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
            activeCategory === "all"
              ? "bg-pink-500 text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? "bg-pink-500 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {successMsg && (
          <div className="mb-3 bg-green-100 border border-green-300 text-green-800 px-4 py-2.5 rounded-xl text-center font-medium text-sm">
            ✅ {successMsg}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredProducts.map((product) => {
            const inCart = cart.find((i) => i.product.id === product.id);
            const isLow =
              product.stock > 0 &&
              product.stock <= product.low_stock_threshold;
            const isOut = product.stock <= 0;

            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={isOut}
                className={`relative bg-white rounded-xl shadow-sm overflow-hidden text-left transition-all active:scale-95 ${
                  isOut
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:shadow-md cursor-pointer"
                } ${inCart ? "ring-2 ring-pink-400" : ""}`}
              >
                {/* Image */}
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">
                      🧶
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2">
                  <div className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">
                    {product.name}
                  </div>
                  <div className="text-pink-600 font-bold mt-1 text-sm">
                    ${product.price}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className={`text-xs ${
                        isLow ? "text-red-500 font-medium" : "text-gray-400"
                      }`}
                    >
                      庫存 {product.stock}
                    </span>
                    {inCart && (
                      <span className="bg-pink-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {inCart.quantity}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                {isLow && !isOut && (
                  <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                    低
                  </div>
                )}
                {isOut && (
                  <div className="absolute top-1 left-1 bg-gray-400 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                    缺
                  </div>
                )}
              </button>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📭</div>
              <p>此分類沒有商品</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Bottom Bar */}
      {cartCount > 0 && (
        <div className="bg-white border-t px-4 py-3 flex-shrink-0 shadow-lg">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white rounded-xl py-3.5 flex items-center justify-between px-4"
          >
            <span className="bg-white bg-opacity-25 rounded-lg px-2 py-0.5 text-sm font-medium">
              {cartCount} 件
            </span>
            <span className="font-bold">查看購物車</span>
            <span className="font-bold">${cartTotal.toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="flex-1 bg-black bg-opacity-50"
            onClick={() => setShowCart(false)}
          />
          <div className="bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-lg">購物車</h2>
              <button
                onClick={() => setShowCart(false)}
                className="text-gray-400 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-3"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {item.product.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">
                        🧶
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {item.product.name}
                    </div>
                    <div className="text-pink-600 text-sm">
                      ${item.product.price}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => updateQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-medium text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.product.id, 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="ml-1 text-red-400 text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-right w-16 text-sm font-semibold flex-shrink-0">
                    ${(item.product.price * item.quantity).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout Area */}
            <div className="border-t px-5 pt-4 pb-6 space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">總計</span>
                <span className="text-pink-600 font-bold text-xl">
                  ${cartTotal.toLocaleString()}
                </span>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  ❌ {errorMsg}
                </div>
              )}

              {/* Payment Method */}
              <div className="flex gap-3">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex-1 py-3 rounded-xl font-medium border-2 transition-colors text-sm ${
                    paymentMethod === "cash"
                      ? "border-pink-500 bg-pink-50 text-pink-700"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  💵 現金
                </button>
                <button
                  onClick={() => setPaymentMethod("linepay")}
                  className={`flex-1 py-3 rounded-xl font-medium border-2 transition-colors text-sm ${
                    paymentMethod === "linepay"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  📱 LinePay
                </button>
              </div>

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-bold py-4 rounded-xl text-lg"
              >
                {checkoutLoading ? "結帳中..." : "確認結帳"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
