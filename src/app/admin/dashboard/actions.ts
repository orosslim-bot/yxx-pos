"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/require-admin";

type OrderItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type Order = {
  id: string;
  created_at: string;
  payment_method: string;
  order_items: OrderItem[];
};

export async function exportMonthlyOrdersCsv(): Promise<string> {
  await requireAdmin();
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01T00:00:00Z`;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, payment_method, order_items(product_name, quantity, unit_price, subtotal)"
    )
    .gte("created_at", monthStart)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows: string[] = ["日期,訂單編號,商品名稱,數量,單價,小計,支付方式"];

  (orders as Order[])?.forEach((order) => {
    const dateStr = order.created_at.slice(0, 10);
    const shortId = order.id.slice(0, 8).toUpperCase();
    const payment = order.payment_method === "cash" ? "現金" : "Line Pay";

    order.order_items?.forEach((item) => {
      rows.push(
        [
          dateStr,
          shortId,
          `"${item.product_name}"`,
          item.quantity,
          item.unit_price,
          item.subtotal,
          payment,
        ].join(",")
      );
    });
  });

  return rows.join("\n");
}

export async function deleteOrder(orderId: string): Promise<void> {
  await requireAdmin();
  const db = createServiceClient();

  // 先取得訂單商品，以便回補庫存
  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);
  if (itemsErr) throw new Error(itemsErr.message);

  // 刪除訂單（order_items 由 DB cascade 自動清除）
  const { error: deleteErr } = await db.from("orders").delete().eq("id", orderId);
  if (deleteErr) throw new Error(deleteErr.message);

  // 回補庫存
  for (const item of items ?? []) {
    const { data: product } = await db
      .from("products")
      .select("stock")
      .eq("id", item.product_id)
      .single();
    if (product) {
      await db
        .from("products")
        .update({ stock: product.stock + item.quantity })
        .eq("id", item.product_id);
    }
  }
}
