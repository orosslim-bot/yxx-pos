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

  let isAdmin = false;
  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  const [{ data: products }, { data: categories }] = await Promise.all([
    db
      .from("products")
      .select("*, categories(id, name)")
      .eq("is_active", true)
      .order("name"),
    db.from("categories").select("*").order("id"),
  ]);

  // Today's stats (booth-specific if booth session)
  const todayStr = new Date().toISOString().slice(0, 10);
  let statsQuery = db
    .from("orders")
    .select("total")
    .gte("created_at", `${todayStr}T00:00:00Z`);
  if (booth) {
    statsQuery = statsQuery.eq("booth_id", booth.id);
  }
  const { data: todayOrders } = await statsQuery;
  const todayTotal = (todayOrders ?? []).reduce(
    (s: number, o: { total: number }) => s + o.total,
    0
  );
  const todayCount = (todayOrders ?? []).length;

  const linePayQrUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/linepay-qr/qr.png`;

  return (
    <PosClient
      initialProducts={(products as Product[]) ?? []}
      categories={categories ?? []}
      isAdmin={isAdmin}
      booth={booth}
      userEmail={user?.email ?? null}
      todayTotal={todayTotal}
      todayCount={todayCount}
      linePayQrUrl={linePayQrUrl}
    />
  );
}
