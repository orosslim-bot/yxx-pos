"use server";

import { createClient } from "@/lib/supabase/server";
import { CartItem } from "@/lib/types";

export async function checkout(
  items: CartItem[],
  paymentMethod: "cash" | "linepay"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("請先登入");

  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  // 建立訂單
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({ total, payment_method: paymentMethod, cashier_id: user.id })
    .select()
    .single();

  if (orderError) throw new Error(orderError.message);

  // 建立訂單明細
  const { error: itemsError } = await supabase.from("order_items").insert(
    items.map((item) => ({
      order_id: order.id,
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.price,
      subtotal: item.product.price * item.quantity,
    }))
  );

  if (itemsError) throw new Error(itemsError.message);

  // 扣庫存（deduct_stock 需有 SECURITY DEFINER）
  for (const item of items) {
    const { error: stockError } = await supabase.rpc("deduct_stock", {
      p_id: item.product.id,
      qty: item.quantity,
    });
    if (stockError)
      throw new Error(`${item.product.name}：${stockError.message}`);
  }

  return { success: true, orderId: order.id };
}
