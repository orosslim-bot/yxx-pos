import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DashboardClient from "@/components/admin/DashboardClient";

type OrderItem = { product_name: string; quantity: number };
type Order = { id: string; created_at: string; total: number; payment_method: string; order_items: OrderItem[] };
type TodayOrderDetail = { id: string; time: string; total: number; payment_method: string };
type AdminOrder = {
  id: string;
  shortId: string;
  time: string;
  boothName: string | null;
  payment_method: string;
  total: number;
  itemsSummary: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ booth?: string }>;
}) {
  const { booth: boothFilter } = await searchParams;
  const boothId = boothFilter ? parseInt(boothFilter) : null;

  const supabase = await createClient();
  const db = createServiceClient();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01T00:00:00Z`;

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const queryStart = weekAgoStr + "T00:00:00Z" < monthStart ? weekAgoStr + "T00:00:00Z" : monthStart;

  let ordersQuery = db
    .from("orders")
    .select("id, created_at, total, payment_method, order_items(product_name, quantity)")
    .gte("created_at", queryStart)
    .order("created_at", { ascending: true });

  if (boothId) {
    ordersQuery = ordersQuery.eq("booth_id", boothId);
  }

  // 今日所有攤位的訂單（管理用，不受 boothFilter 限制）
  const adminOrdersQuery = db
    .from("orders")
    .select("id, created_at, payment_method, total, booth_id, booths(name), order_items(product_name, quantity)")
    .gte("created_at", `${todayStr}T00:00:00Z`)
    .order("created_at", { ascending: false });

  const [{ data: rawOrders }, { data: allProducts }, { data: booths }, { data: rawAdminOrders }] = await Promise.all([
    ordersQuery,
    db.from("products").select("id, name, sku, stock, low_stock_threshold, image_url").eq("is_active", true),
    db.from("booths").select("id, name").order("id"),
    adminOrdersQuery,
  ]);

  // supabase is used for auth check in admin layout; suppress unused warning
  void supabase;

  const orders = (rawOrders as Order[]) ?? [];
  const lowStockProducts = (allProducts ?? []).filter((p) => p.stock <= p.low_stock_threshold);

  const todayOrders = orders.filter((o) => o.created_at.slice(0, 10) === todayStr);
  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0);
  const todayCount = todayOrders.length;

  const todayCashOrders = todayOrders.filter((o) => o.payment_method === "cash");
  const todayLinePayOrders = todayOrders.filter((o) => o.payment_method !== "cash");
  const todayCashTotal = todayCashOrders.reduce((s, o) => s + o.total, 0);
  const todayLinePayTotal = todayLinePayOrders.reduce((s, o) => s + o.total, 0);

  const todayOrderDetails: TodayOrderDetail[] = [...todayOrders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((o) => ({
      id: o.id.slice(0, 8).toUpperCase(),
      time: new Date(o.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }),
      total: o.total,
      payment_method: o.payment_method,
    }));

  const monthOrders = orders.filter((o) => o.created_at >= monthStart);
  const monthTotal = monthOrders.reduce((s, o) => s + o.total, 0);

  const weekChartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const revenue = orders
      .filter((o) => o.created_at.slice(0, 10) === dayStr)
      .reduce((s, o) => s + o.total, 0);
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, revenue };
  });

  const productSales: Record<string, number> = {};
  monthOrders.forEach((order) => {
    order.order_items?.forEach((item) => {
      productSales[item.product_name] = (productSales[item.product_name] ?? 0) + item.quantity;
    });
  });
  const top5 = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  type RawAdminOrder = {
    id: string;
    created_at: string;
    payment_method: string;
    total: number;
    booths: { name: string } | { name: string }[] | null;
    order_items: { product_name: string; quantity: number }[];
  };
  const adminOrders: AdminOrder[] = ((rawAdminOrders as unknown as RawAdminOrder[]) ?? []).map((o) => {
    const boothsRaw = o.booths;
    const boothName = Array.isArray(boothsRaw)
      ? (boothsRaw[0]?.name ?? null)
      : (boothsRaw?.name ?? null);
    return {
      id: o.id,
      shortId: o.id.slice(0, 8).toUpperCase(),
      time: new Date(o.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }),
      boothName,
      payment_method: o.payment_method,
      total: o.total,
      itemsSummary: (o.order_items ?? []).map((i) => `${i.product_name} ×${i.quantity}`).join("、"),
    };
  });

  return (
    <DashboardClient
      todayTotal={todayTotal}
      todayCount={todayCount}
      todayCashTotal={todayCashTotal}
      todayLinePayTotal={todayLinePayTotal}
      todayCashCount={todayCashOrders.length}
      todayLinePayCount={todayLinePayOrders.length}
      todayOrderDetails={todayOrderDetails}
      monthTotal={monthTotal}
      weekChartData={weekChartData}
      top5={top5}
      lowStockProducts={lowStockProducts}
      booths={booths ?? []}
      currentBoothId={boothId}
      adminOrders={adminOrders}
    />
  );
}
