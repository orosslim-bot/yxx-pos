"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { CartItem } from "@/lib/types";
import { verifyBoothSession } from "@/lib/booth-mac";

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
  const boothSigStr = cookieStore.get("booth_sig")?.value;
  const boothValid =
    boothIdStr && boothNameStr && boothSigStr
      ? await verifyBoothSession(boothIdStr, boothNameStr, boothSigStr)
      : false;
  const booth = boothValid && boothIdStr && boothNameStr
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

export type TodayOrderItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type TodayOrder = {
  id: string;
  time: string;
  payment_method: string;
  total: number;
  items: TodayOrderItem[];
};

export async function getTodayOrders(boothId: number | null): Promise<TodayOrder[]> {
  const db = createServiceClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  type OrderRow = {
    id: string;
    created_at: string;
    payment_method: string;
    total: number;
    booth_id: number | null;
    order_items: { product_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number }[];
  };

  let query = db
    .from("orders")
    .select("id, created_at, payment_method, total, booth_id, order_items(product_id, product_name, quantity, unit_price, subtotal)")
    .gte("created_at", `${todayStr}T00:00:00Z`)
    .order("created_at", { ascending: false });

  if (boothId !== null) {
    query = (query as typeof query).eq("booth_id", boothId);
  }

  const { data: orders } = await query;

  return (orders as OrderRow[] ?? []).map((order) => ({
    id: order.id.slice(0, 8).toUpperCase(),
    time: new Date(order.created_at).toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    payment_method: order.payment_method,
    total: order.total,
    items: (order.order_items ?? []).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal ?? item.unit_price * item.quantity,
    })),
  }));
}
