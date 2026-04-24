import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PosClient from "./PosClient";
import { Product } from "@/lib/types";

export default async function PosPage() {
  const cookieStore = await cookies();
  const boothIdStr = cookieStore.get("booth_id")?.value;
  const boothNameStr = cookieStore.get("booth_name")?.value;
  const booth =
    boothIdStr && boothNameStr
      ? { id: Number(boothIdStr), name: boothNameStr }
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !booth) redirect("/login");

  const db = createServiceClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 平行執行所有資料庫查詢，縮短載入時間
  const statsBase = db
    .from("orders")
    .select("total, payment_method")
    .gte("created_at", `${todayStr}T00:00:00Z`);

  const [profileResult, productsResult, categoriesResult, ordersResult] =
    await Promise.all([
      user
        ? db.from("profiles").select("role").eq("id", user.id).single()
        : Promise.resolve({ data: null }),
      db
        .from("products")
        .select("*, categories(id, name)")
        .eq("is_active", true)
        .order("name"),
      db.from("categories").select("*").order("id"),
      booth ? statsBase.eq("booth_id", booth.id) : statsBase,
    ]);

  const isAdmin = (profileResult as { data: { role: string } | null }).data?.role === "admin";
  const orders = ((ordersResult.data ?? []) as { total: number; payment_method: string }[]);
  const todayTotal = orders.reduce((s, o) => s + o.total, 0);
  const todayCount = orders.length;
  const todayCashTotal = orders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total, 0);
  const todayLinePayTotal = orders.filter((o) => o.payment_method !== "cash").reduce((s, o) => s + o.total, 0);

  const linePayQrUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/linepay-qr/qr.png`;

  return (
    <PosClient
      initialProducts={(productsResult.data as Product[]) ?? []}
      categories={categoriesResult.data ?? []}
      isAdmin={!!isAdmin}
      booth={booth}
      userEmail={user?.email ?? null}
      todayTotal={todayTotal}
      todayCount={todayCount}
      todayCashTotal={todayCashTotal}
      todayLinePayTotal={todayLinePayTotal}
      linePayQrUrl={linePayQrUrl}
    />
  );
}
