"use client";

import { useState, useRef } from "react";
import { importProducts } from "./actions";

type PreviewRow = {
  sku: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  image_filename: string;
  note: string;
  _valid: boolean;
};

export default function ImportPage() {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setError(null);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const parsed: PreviewRow[] = rows.map((row) => ({
        sku: String(row["SKU"] ?? ""),
        name: String(row["品名"] ?? "").trim(),
        category: String(row["分類"] ?? ""),
        price: Number(row["定價"] ?? 0),
        cost: Number(row["成本"] ?? 0),
        stock: Number(row["庫存"] ?? 0),
        low_stock_threshold: Number(row["低庫存警戒"] ?? 1),
        image_filename: String(row["圖片檔名"] ?? ""),
        note: String(row["備註"] ?? ""),
        _valid: Boolean(String(row["品名"] ?? "").trim()),
      }));

      setPreview(parsed);
    } catch {
      setError("檔案解析失敗，請確認格式正確（.xlsx）");
    }
  }

  async function handleImport() {
    const validRows = preview.filter((r) => r._valid);
    if (validRows.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await importProducts(validRows);
      setResult(`✅ 成功匯入 ${res.count} 筆商品！`);
      setPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const validCount = preview.filter((r) => r._valid).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">匯入商品</h1>

      {/* Format Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h2 className="font-medium text-blue-800 mb-2">📋 Excel 格式說明</h2>
        <p className="text-sm text-blue-700 mb-1">
          第一列為欄位標題，請依序填入：
        </p>
        <div className="bg-blue-100 rounded-lg px-3 py-2 text-xs font-mono text-blue-800 overflow-x-auto">
          SKU | 品名 | 分類 | 定價 | 成本 | 庫存 | 低庫存警戒 | 圖片檔名 | 備註
        </div>
        <div className="mt-2 text-xs text-blue-600 space-y-0.5">
          <p>• 「品名」為必填，其他選填</p>
          <p>• 「分類」請填：公仔、花藝、髮飾、掛件、盆栽類、其他</p>
          <p>• 圖片檔名暫不處理（之後可另外上傳）</p>
        </div>
      </div>

      {/* File Upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-pink-400 hover:bg-pink-50 transition-colors mb-6"
      >
        <div className="text-4xl mb-2">📂</div>
        <div className="text-gray-600 font-medium">點擊選擇 Excel 檔案</div>
        <div className="text-sm text-gray-400 mt-1">.xlsx 或 .xls 格式</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* Messages */}
      {result && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 font-medium">
          {result}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
          ❌ {error}
        </div>
      )}

      {/* Preview Table */}
      {preview.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-medium text-gray-700">
                預覽（{validCount} 筆有效 / {preview.length} 筆總計）
              </h2>
              {preview.length > validCount && (
                <p className="text-xs text-red-500 mt-0.5">
                  ⚠ {preview.length - validCount} 筆缺少品名，將被略過
                </p>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={loading || validCount === 0}
              className="bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white px-5 py-2 rounded-lg font-medium"
            >
              {loading ? "匯入中..." : `確認匯入 ${validCount} 筆`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">
                    品名
                  </th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">
                    SKU
                  </th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">
                    分類
                  </th>
                  <th className="px-3 py-2 text-right text-gray-600 font-medium">
                    定價
                  </th>
                  <th className="px-3 py-2 text-right text-gray-600 font-medium">
                    庫存
                  </th>
                  <th className="px-3 py-2 text-center text-gray-600 font-medium">
                    狀態
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((row, i) => (
                  <tr key={i} className={!row._valid ? "opacity-40 bg-red-50" : ""}>
                    <td className="px-3 py-2 font-medium">
                      {row.name || "（空白）"}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{row.sku}</td>
                    <td className="px-3 py-2">{row.category}</td>
                    <td className="px-3 py-2 text-right">${row.price}</td>
                    <td className="px-3 py-2 text-right">{row.stock}</td>
                    <td className="px-3 py-2 text-center">
                      {row._valid ? "✅" : "❌ 缺品名"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
