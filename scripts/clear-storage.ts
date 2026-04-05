/**
 * 清除 Supabase Storage product-images/products/ 資料夾
 * 用法：npx tsx scripts/clear-storage.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "product-images";
const PREFIX = "products";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log(`🗑️  清除 Storage：${BUCKET}/${PREFIX}/\n`);

  // 1. 列出所有檔案（分頁）
  const allPaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: 1000, offset });

    if (error) {
      console.error("❌ 無法列出檔案：", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    data.forEach((f) => allPaths.push(`${PREFIX}/${f.name}`));
    console.log(`  找到 ${allPaths.length} 個檔案...`);

    if (data.length < 1000) break;
    offset += 1000;
  }

  if (allPaths.length === 0) {
    console.log("✅ Storage 已是空的，無需清除。");
    return;
  }

  console.log(`\n共 ${allPaths.length} 個檔案，開始刪除...\n`);

  // 2. 分批刪除（每批 100 個，Supabase 限制）
  const BATCH = 100;
  let deleted = 0;

  for (let i = 0; i < allPaths.length; i += BATCH) {
    const batch = allPaths.slice(i, i + BATCH);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);

    if (error) {
      console.error(`❌ 刪除失敗（批次 ${i / BATCH + 1}）：${error.message}`);
    } else {
      deleted += batch.length;
      console.log(`  已刪除 ${deleted} / ${allPaths.length}`);
    }
  }

  console.log(`\n✅ 清除完成，共刪除 ${deleted} 個檔案。`);
}

main().catch((err) => {
  console.error("腳本異常終止：", err);
  process.exit(1);
});
