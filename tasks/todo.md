# Sprint 1 — 地基任務清單

## 目標
建立 YXX-POS 專案地基，完成後可以從手機瀏覽器打開網址並登入。

## 任務

- [x] 建立 tasks/todo.md 計畫
- [x] 初始化 Next.js 16 專案（TypeScript + Tailwind + App Router）
- [x] 安裝額外套件：@supabase/supabase-js @supabase/ssr next-pwa
- [x] 輸出 Supabase SQL（存至 supabase/schema.sql）
- [x] 建立 .env.local 範本
- [x] 建立 src/lib/supabase/client.ts
- [x] 建立 src/lib/supabase/server.ts
- [x] 建立 src/proxy.ts（Next.js 16 新路由保護）
- [x] 建立登入頁 app/(auth)/login/page.tsx
- [x] 建立 POS 佔位頁 app/pos/page.tsx
- [x] npm run build 無錯誤 ✅
- [ ] 填入 Supabase 環境變數（等使用者操作）
- [ ] 推上 GitHub 並部署 Vercel

## 結果

- Build 通過：Next.js 16.2.2，無錯誤，無警告
- 路由：`/` → 自動跳 `/pos`、`/login`（靜態）、`/pos`（動態需登入）
- Proxy（路由保護）運作正常

## 筆記

- Next.js 16 把 `middleware.ts` 改名為 `proxy.ts`，函式名稱也要改為 `proxy`
- Node.js v25 需要完整重裝 node_modules 才能 build 成功
