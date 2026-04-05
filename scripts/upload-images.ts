/**
 * 圖片批量上傳腳本
 * 用法：npx tsx scripts/upload-images.ts
 *
 * Storage key 規則：
 *   檔名 730667134085_5060163272736_茉莉公主款.jpg
 *   → 取第二段：5060163272736
 *   → 後 6 碼：272736
 *   → Storage key：products/272736.jpg
 *
 * DB 比對：用 image_filename 找到商品，更新其 image_url
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// ── 設定 ─────────────────────────────────────────────────────
const IMAGE_DIR = "/Users/samdream/Desktop/1688_Project/images/";
const BUCKET = "product-images";
const STORAGE_PREFIX = "products";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// ─────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  if (!SUPABASE_URL) console.error("❌ NEXT_PUBLIC_SUPABASE_URL 未設定");
  if (!SERVICE_ROLE_KEY) console.error("❌ SUPABASE_SERVICE_ROLE_KEY 未設定");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── SKU 解析：取第二段數字的後 6 碼 ─────────────────────────
// 730667134085_5060163272736_茉莉公主款.jpg → "272736"
function parseSkuFromFilename(filename: string): string | null {
  const noExt = filename.replace(/\.(jpg|jpeg)$/i, "");
  const parts = noExt.split("_");
  if (parts.length < 2) return null;
  const second = parts[1]; // "5060163272736"
  if (!/^\d+$/.test(second) || second.length < 6) return null;
  return second.slice(-6); // "272736"
}

function pad(current: number, total: number): string {
  const w = String(total).length;
  return `[${String(current).padStart(w)}/${total}]`;
}

async function getExistingStorageFiles(): Promise<Set<string>> {
  const existing = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(STORAGE_PREFIX, { limit: 1000, offset });
    if (error) { console.warn("⚠️  無法讀取 Storage 清單：", error.message); break; }
    if (!data || data.length === 0) break;
    data.forEach((f) => existing.add(f.name));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return existing;
}

async function main() {
  console.log("🚀 圖片批量上傳腳本啟動\n");
  console.log(`📁 來源資料夾：${IMAGE_DIR}`);
  console.log(`☁️  目標 Bucket：${BUCKET}/${STORAGE_PREFIX}/\n`);

  // ── 1. 讀取本機圖片 ───────────────────────────────────────
  if (!fs.existsSync(IMAGE_DIR)) {
    console.error(`❌ 資料夾不存在：${IMAGE_DIR}`);
    process.exit(1);
  }
  const jpgFiles = fs
    .readdirSync(IMAGE_DIR)
    .filter((f) => /\.(jpg|jpeg|JPG|JPEG)$/.test(f));

  console.log(`找到 ${jpgFiles.length} 個 .jpg 檔案`);

  // ── 2. 一次拉取所有有 image_filename 的商品（filename → id/name）
  console.log("正在從 DB 取得商品對照表（by image_filename）...");
  const { data: dbProducts, error: dbErr } = await supabase
    .from("products")
    .select("id, name, image_filename")
    .not("image_filename", "is", null);

  if (dbErr) {
    console.error("❌ DB 查詢失敗：", dbErr.message);
    process.exit(1);
  }

  type ProductRow = { id: string; name: string; image_filename: string };
  const productMap = new Map<string, ProductRow>();
  (dbProducts as ProductRow[])?.forEach((p) => {
    if (p.image_filename) productMap.set(p.image_filename, p);
  });
  console.log(`DB 共有 ${productMap.size} 筆商品有 image_filename\n`);

  // ── 3. 取得 Storage 已存在的檔案 ──────────────────────────
  console.log("正在檢查 Storage 現有檔案...");
  const existingInStorage = await getExistingStorageFiles();
  console.log(`Storage 已有 ${existingInStorage.size} 個檔案\n`);
  console.log("─".repeat(64));

  // ── 4. 逐個處理 ──────────────────────────────────────────
  const failures: Array<{ file: string; reason: string }> = [];
  let uploadedCount = 0;
  let skippedCount = 0;
  let dbUpdatedCount = 0;
  let dbNotFoundCount = 0;
  let parseFailCount = 0;

  for (let i = 0; i < jpgFiles.length; i++) {
    const filename = jpgFiles[i];
    const localPath = path.join(IMAGE_DIR, filename);
    const progress = pad(i + 1, jpgFiles.length);

    // Step A：從檔名解析 SKU（後 6 碼）
    const parsedSku = parseSkuFromFilename(filename);
    if (!parsedSku) {
      console.log(`${progress} ⚠️  無法解析 SKU：${filename}`);
      parseFailCount++;
      continue;
    }

    const skuFilename = `${parsedSku}.jpg`;          // e.g. "272736.jpg"
    const storagePath = `${STORAGE_PREFIX}/${skuFilename}`;

    // Step B：上傳到 Storage（用解析出的 SKU 命名，無中文）
    if (existingInStorage.has(skuFilename)) {
      process.stdout.write(`${progress} 跳過（已存在）→ ${skuFilename}\n`);
      skippedCount++;
    } else {
      process.stdout.write(
        `${progress} ${filename}\n          → 上傳 ${skuFilename} ... `
      );

      const buffer = fs.readFileSync(localPath);
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: false });

      if (uploadErr) {
        if (
          uploadErr.message.toLowerCase().includes("already exists") ||
          uploadErr.message.includes("409")
        ) {
          console.log("跳過（已存在）");
          skippedCount++;
        } else {
          console.log(`❌ 上傳失敗：${uploadErr.message}`);
          failures.push({ file: filename, reason: `上傳失敗：${uploadErr.message}` });
          continue;
        }
      } else {
        console.log("✅ 上傳成功");
        uploadedCount++;
      }
    }

    // Step C：比對 DB（用 image_filename）並更新 image_url
    const product = productMap.get(filename);
    if (!product) {
      console.log(`          ⚠️  DB 找不到 image_filename=${filename}`);
      dbNotFoundCount++;
      continue;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const { error: updateErr } = await supabase
      .from("products")
      .update({ image_url: urlData.publicUrl })
      .eq("id", product.id);

    if (updateErr) {
      console.log(`          ❌ DB 更新失敗：${updateErr.message}`);
      failures.push({ file: filename, reason: `DB更新失敗：${updateErr.message}` });
    } else {
      console.log(`          ✅ DB 已更新 → ${product.name}`);
      dbUpdatedCount++;
    }
  }

  // ── 5. 統計報告 ───────────────────────────────────────────
  console.log("\n" + "=".repeat(64));
  console.log("📊 執行結果統計");
  console.log("=".repeat(64));
  console.log(`  圖片總數：          ${jpgFiles.length} 個`);
  console.log(`  新上傳：            ${uploadedCount} 個`);
  console.log(`  跳過（已存在）：    ${skippedCount} 個`);
  console.log(`  DB 更新成功：       ${dbUpdatedCount} 個`);
  console.log(`  DB 找不到商品：     ${dbNotFoundCount} 個`);
  console.log(`  SKU 解析失敗：      ${parseFailCount} 個`);
  console.log(`  失敗：              ${failures.length} 個`);

  if (failures.length > 0) {
    console.log("\n❌ 失敗清單：");
    failures.forEach(({ file, reason }) => {
      console.log(`  • ${file}`);
      console.log(`    原因：${reason}`);
    });
  } else {
    console.log("\n✅ 全部完成，無失敗記錄！");
  }
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("\n腳本異常終止：", err);
  process.exit(1);
});
