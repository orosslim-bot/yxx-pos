import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/admin/DashboardClient";

type OrderItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type Order = {
  id: string;
  created_at: string;
  total: number;
  payment_method: string;
  order_items: OrderItem[];
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01T00:00:00Z`;

  // 7 天前（近 7 日折線圖）
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const queryStart =
    weekAgoStr + "T00:00:00Z" < monthStart
      ? weekAgoStr + "T00:00:00Z"
      : monthStart;

  // 一次拉取所有需要的訂單（涵蓋本月 & 近 7 日）
  const { data: rawOrders } = await supabase
    .from("orders")
    .select(
      "id, created_at, total, payment_method, order_items(product_name, quantity, unit_price, subtotal)"
    )
    .gte("created_at", queryStart)
    .order("created_at", { ascending: true });

  const orders = (rawOrders as Order[]) ?? [];

  // 低庫存商品（一次拉全部，JS 過濾）
  const { data: allProducts } = await supabase
    .from("products")
    .select("id, name, sku, stock, low_stock_threshold, image_url")
    .eq("is_active", true);

  const lowStockProducts = (allProducts ?? []).filter(
    (p) => p.stock <= p.low_stock_threshold
  );

  // ── 計算各指標 ──────────────────────────────────────────

  // 今日
  const todayOrders = orders.filter(
    (o) => o.created_at.slice(0, 10) === todayStr
  );
  const todayTotal = todayOrders.reduce((sum, o) => sum + o.total, 0);
  const todayCount = todayOrders.length;

  // 本月
  const monthOrders = orders.filter((o) => o.created_at >= monthStart);
  const monthTotal = monthOrders.reduce((sum, o) => sum + o.total, 0);

  // 近 7 日折線資料
  const weekChartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const revenue = orders
      .filter((o) => o.created_at.slice(0, 10) === dayStr)
      .reduce((sum, o) => sum + o.total, 0);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      revenue,
    };
  });

  // 本月 Top 5 商品（依銷售數量）
  const productSales: Record<string, number> = {};
  monthOrders.forEach((order) => {
    order.order_items?.forEach((item) => {
      productSales[item.product_name] =
        (productSales[item.product_name] ?? 0) + item.quantity;
    });
  });
  const top5 = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  return (
    <DashboardClient
      todayTotal={todayTotal}
      todayCount={todayCount}
      monthTotal={monthTotal}
      weekChartData={weekChartData}
      top5={top5}
      lowStockProducts={lowStockProducts}
    />
  );
}
