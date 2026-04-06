"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { exportMonthlyOrdersCsv } from "@/app/admin/dashboard/actions";
import Image from "next/image";

type WeekDataPoint = { date: string; revenue: number };
type Top5Item = { name: string; qty: number };
type LowStockProduct = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
};

type Props = {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  weekChartData: WeekDataPoint[];
  top5: Top5Item[];
  lowStockProducts: LowStockProduct[];
  booths: { id: number; name: string }[];
  currentBoothId: number | null;
};

function formatMoney(n: number) {
  return `$${n.toLocaleString()}`;
}

export default function DashboardClient({
  todayTotal,
  todayCount,
  monthTotal,
  weekChartData,
  top5,
  lowStockProducts,
  booths,
  currentBoothId,
}: Props) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportMonthlyOrdersCsv();
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const bom = "\uFEFF";
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `YXX-POS-${yearMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("匯出失敗：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Booth Filter */}
      {booths.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">篩選攤位：</label>
          <select
            value={currentBoothId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              router.push(val ? `/admin/dashboard?booth=${val}` : "/admin/dashboard");
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
          >
            <option value="">全部攤位</option>
            {booths.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">報表 Dashboard</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {exporting ? (
            <>
              <span className="animate-spin">⏳</span> 匯出中...
            </>
          ) : (
            <>📥 匯出本月訂單</>
          )}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">今日營業額</p>
          <p className="text-2xl font-bold text-pink-500">
            {formatMoney(todayTotal)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">今日訂單數</p>
          <p className="text-2xl font-bold text-gray-800">{todayCount} 筆</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">本月營業額</p>
          <p className="text-2xl font-bold text-green-600">
            {formatMoney(monthTotal)}
          </p>
        </div>
      </div>

      {/* Week Chart */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          近 7 日每日營業額
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={weekChartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              formatter={(value) =>
                typeof value === "number"
                  ? [`$${value.toLocaleString()}`, "營業額"]
                  : [value, "營業額"]
              }
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#ec4899"
              strokeWidth={2}
              dot={{ fill: "#ec4899", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Top 5 Products */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            本月銷量 Top 5
          </h2>
          {top5.length === 0 ? (
            <p className="text-sm text-gray-400">本月尚無銷售記錄</p>
          ) : (
            <ol className="space-y-2">
              {top5.map((item, i) => (
                <li key={item.name} className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      i === 0
                        ? "bg-yellow-400 text-white"
                        : i === 1
                        ? "bg-gray-400 text-white"
                        : i === 2
                        ? "bg-orange-400 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 truncate">
                    {item.name}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 flex-shrink-0">
                    {item.qty} 件
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            低庫存警告
            {lowStockProducts.length > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                {lowStockProducts.length} 件
              </span>
            )}
          </h2>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-gray-400">庫存充足，無需補貨 ✅</p>
          ) : (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {lowStockProducts.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      width={32}
                      height={32}
                      className="rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-100 rounded flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">SKU: {p.sku ?? "—"}</p>
                  </div>
                  <span className="text-sm font-bold text-red-500 flex-shrink-0">
                    剩 {p.stock}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
