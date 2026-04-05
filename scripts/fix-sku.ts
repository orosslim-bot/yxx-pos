/**
 * 修正 products.sku 欄位
 * 用法：npx tsx scripts/fix-sku.ts
 *
 * 邏輯：
 *   image_filename: 730667134085_5060163272736_茉莉公主款.jpg
 *   → 取第二段：5060163272736
 *   → 後 6 碼：272736
 *   → 寫入 products.sku
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  if (!SUPABASE_URL) console.error("❌ NEXT_PUBLIC_SUPABASE_URL 未設定");
  if (!SERVICE_ROLE_KEY) console.error("❌ SUPABASE_SERVICE_ROLE_KEY 未設定");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseSkuFromFilename(filename: string): string | null {
  const noExt = filename.replace(/\.(jpg|jpeg)$/i, "");
  const parts = noExt.split("_");
  if (parts.length < 2) return null;
  const second = parts[1]; // "5060163272736"
  if (!/^\d+$/.test(second) || second.length < 6) return null;
  return second.slice(-6); // "272736"
}

function pad(n: number, total: number) {
  return `[${String(n).padStart(String(total).length)}/${total}]`;
}

async function main() {
  console.log("🔧 開始修正 products.sku\n");

  // 取得所有有 image_filename 的商品
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, sku, image_filename")
    .not("image_filename", "is", null);

  if (error) {
    console.error("❌ DB 查詢失敗：", error.message);
    process.exit(1);
  }

  console.log(`共 ${products!.length} 筆商品有 image_filename\n`);
  console.log("─".repeat(60));

  let updated = 0;
  let skipped = 0;
  let parseFailed = 0;
  const failures: Array<{ name: string; filename: string; reason: string }> = [];

  for (let i = 0; i < products!.length; i++) {
    const p = products![i] as {
      id: string; name: string; sku: string | null; image_filename: string;
    };
    const progress = pad(i + 1, products!.length);
    const correctSku = parseSkuFromFilename(p.image_filename);

    if (!correctSku) {
      console.log(`${progress} ⚠️  無法解析：${p.image_filename}`);
      parseFailed++;
      continue;
    }

    // 若已經是正確值就跳過
    if (p.sku === correctSku) {
      console.log(`${progress} 跳過（已正確）${p.name} → ${correctSku}`);
      skipped++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("products")
      .update({ sku: correctSku })
      .eq("id", p.id);

    if (updateErr) {
      console.log(`${progress} ❌ 更新失敗：${p.name} → ${updateErr.message}`);
      failures.push({ name: p.name, filename: p.image_filename, reason: updateErr.message });
    } else {
      console.log(`${progress} ✅ ${p.name}  ${p.sku ?? "(空)"} → ${correctSku}`);
      updated++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 統計");
  console.log("=".repeat(60));
  console.log(`  更新成功：    ${updated} 筆`);
  console.log(`  已正確跳過：  ${skipped} 筆`);
  console.log(`  解析失敗：    ${parseFailed} 筆`);
  console.log(`  更新失敗：    ${failures.length} 筆`);

  if (failures.length > 0) {
    console.log("\n❌ 失敗清單：");
    failures.forEach(({ name, filename, reason }) => {
      console.log(`  • ${name}（${filename}）`);
      console.log(`    原因：${reason}`);
    });
  } else {
    console.log("\n✅ 全部完成！");
  }
}

main().catch((err) => {
  console.error("腳本異常終止：", err);
  process.exit(1);
});
