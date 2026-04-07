import { createServiceClient } from "@/lib/supabase/service";

/**
 * 生成唯一 SKU（8 位數字）
 * 每次生成前查 DB 確認不重複，最多重試 10 次。
 * DB 層也有 UNIQUE 約束作最後防線。
 */
export async function generateUniqueSku(): Promise<string> {
  const supabase = createServiceClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const sku = Math.floor(10000000 + Math.random() * 90000000).toString();
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("sku", sku);
    if ((count ?? 0) === 0) return sku;
  }
  throw new Error("無法生成唯一 SKU，請稍後重試");
}
