# Sprint 2 — 核心功能任務清單

## 目標
完成商品管理（CRUD + 圖片 + 匯入）與 POS 結帳核心功能。

## 任務

- [x] 寫 Sprint 2 計畫
- [ ] 安裝 xlsx 套件（Excel 解析）
- [ ] 更新 next.config.ts（允許 Supabase Storage 圖片來源）
- [ ] 建立 src/lib/types.ts（共用型別）
- [ ] 建立 src/app/admin/layout.tsx（admin auth + 導覽列）
- [ ] 建立 src/app/admin/products/page.tsx（Server Component）
- [ ] 建立 src/app/admin/products/actions.ts（Server Actions: CRUD）
- [ ] 建立 src/components/admin/ProductsManager.tsx（Client Component）
- [ ] 建立 src/app/admin/import/page.tsx（Excel 匯入頁）
- [ ] 建立 src/app/admin/import/actions.ts（批次匯入 Server Action）
- [ ] 取代 src/app/pos/page.tsx（完整 POS 結帳頁）
- [ ] 建立 src/app/pos/actions.ts（checkout Server Action）
- [ ] 輸出 Supabase Storage SQL（使用者手動執行）
- [ ] npm run build 無錯誤

## 架構決策

- `/admin/products` + `/admin/import`：Admin 專屬（layout 做角色驗證）
- `/pos`：所有登入用戶可用（Client Component，useEffect 抓資料）
- 圖片上傳：Client 直接上傳到 Supabase Storage（anon key + RLS）
- deduct_stock：需加 SECURITY DEFINER（輸出 SQL 請使用者執行）
- Excel 解析：xlsx 套件，Client Side，支援 .xlsx/.xls

## 結果

（待完成後填寫）
