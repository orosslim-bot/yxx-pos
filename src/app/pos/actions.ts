"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { CartItem } from "@/lib/types";

export async function checkout(
  items: CartItem[],
  paymentMethod: "cash" | "linepay"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const boothIdStr = cookieStore.get("booth_id")?.value;
  const boothNameStr = cookieStore.get("booth_name")?.value;
  const booth = boothIdStr && boothNameStr
    ? { id: Number(boothIdStr), name: boothNameStr }
    : null;

  if (!user && !booth) throw new Error("請先登入");

  const db = createServiceClient();

  const total = items.reduce((sum, item) => {
    const price = item.overridePrice ?? item.product.price;
    return sum + price * item.quantity;
  }, 0);

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      total,
      payment_method: paymentMethod,
      cashier_id: user?.id ?? null,
      booth_id: booth?.id ?? null,
    })
    .select()
    .single();

  if (orderError) throw new Error(orderError.message);

  const { error: itemsError } = await db.from("order_items").insert(
    items.map((item) => {
      const price = item.overridePrice ?? item.product.price;
      return {
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: price,
        subtotal: price * item.quantity,
      };
    })
  );

  if (itemsError) throw new Error(itemsError.message);

  for (const item of items) {
    const { error: stockError } = await db.rpc("deduct_stock", {
      p_id: item.product.id,
      qty: item.quantity,
    });
    if (stockError)
      throw new Error(`${item.product.name}：${stockError.message}`);
  }

  return { success: true, orderId: order.id };
}

export type TodaySaleItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  sku?: string | null;
};

export async function getTodaySales(boothId: number | null): Promise<TodaySaleItem[]> {
  const db = createServiceClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  type OrderRow = { booth_id: number | null; order_items: { product_id: string; product_name: string; quantity: number; unit_price: number }[] };

  let query = db
    .from("orders")
    .select("booth_id, order_items(product_id, product_name, quantity, unit_price)")
    .gte("created_at", `${todayStr}T00:00:00Z`);

  if (boothId !== null) {
    query = (query as typeof query).eq("booth_id", boothId);
  }

  const { data: orders } = await query;
  const map: Record<string, TodaySaleItem> = {};

  (orders as OrderRow[] ?? []).forEach((order) => {
    (order.order_items ?? []).forEach((item) => {
      if (map[item.product_id]) {
        map[item.product_id].quantity += item.quantity;
      } else {
        map[item.product_id] = { ...item };
      }
    });
  });

  const productIds = Object.keys(map);
  if (productIds.length > 0) {
    const { data: productData } = await db
      .from("products")
      .select("id, sku")
      .in("id", productIds);
    const skuMap: Record<string, string | null> = {};
    (productData ?? []).forEach((p: { id: string; sku: string | null }) => {
      skuMap[p.id] = p.sku;
    });
    Object.values(map).forEach((item) => {
      item.sku = skuMap[item.product_id] ?? null;
    });
  }

  return Object.values(map).sort((a, b) => b.quantity - a.quantity);
}
