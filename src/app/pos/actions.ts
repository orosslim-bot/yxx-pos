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
  const boothStr = cookieStore.get("booth_session")?.value;
  const booth = boothStr ? (JSON.parse(boothStr) as { id: number; name: string }) : null;

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
