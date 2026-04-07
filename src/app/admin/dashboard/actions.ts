"use server";

import { createClient } from "@/lib/supabase/server";
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
