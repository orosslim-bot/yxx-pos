"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Product, Category } from "@/lib/types";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  bulkDeleteProducts,
  duplicateProduct,
} from "@/app/admin/products/actions";
import ExcelJS from "exceljs";
import { downloadLabel, generateSku } from "@/lib/label-utils";

type Props = {
  initialProducts: Product[];
  categories: Category[];
};

const EMPTY_FORM = {
  sku: "",
  name: "",
  category_id: "",
  price: "0",
  cost: "0",
  stock: "0",
  low_stock_threshold: "1",
  note: "",
};

export default function ProductsManager({ initialProducts, categories }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 批量選取
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids: string[]) {
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`確定要刪除選取的 ${selectedIds.size} 件商品嗎？此動作無法復原。`)) return;
    setBulkDeleting(true);
    try {
      await bulkDeleteProducts(Array.from(selectedIds));
      clearSelection();
      router.refresh();
    } catch (err) {
      alert("批量刪除失敗：" + (err as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDuplicate(product: Product) {
    setDuplicatingId(product.id);
    try {
      await duplicateProduct(product.id);
      router.refresh();
    } catch (err) {
      alert("複製失敗：" + (err as Error).message);
    } finally {
      setDuplicatingId(null);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCurrentImageUrl(null);
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      sku: product.sku ?? "",
      name: product.name,
      category_id: product.category_id?.toString() ?? "",
      price: product.price.toString(),
      cost: product.cost.toString(),
      stock: product.stock.toString(),
      low_stock_threshold: product.low_stock_threshold.toString(),
      note: product.note ?? "",
    });
    setCurrentImageUrl(product.image_url);
    setImageFile(null);
    setImagePreview(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  async function compressImage(file: File): Promise<File> {
    const MAX_PX = 1200;
    const QUALITY = 0.82;

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) {
            height = Math.round((height / width) * MAX_PX);
            width = MAX_PX;
          } else {
            width = Math.round((width / height) * MAX_PX);
            height = MAX_PX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          QUALITY
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let imageUrl = editing?.image_url ?? null;
    let imageFilename = editing?.image_filename ?? null;

    if (imageFile) {
      try {
        const compressed = await compressImage(imageFile);
        const formData = new FormData();
        formData.append("file", compressed);
        const result = await uploadProductImage(formData);
        imageUrl = result.url;
        imageFilename = result.filename;
      } catch (err) {
        alert("圖片上傳失敗：" + (err as Error).message);
        setLoading(false);
        return;
      }
    }

    const data = {
      sku: form.sku || null,
      name: form.name,
      category_id: form.category_id ? Number(form.category_id) : null,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      low_stock_threshold: Number(form.low_stock_threshold),
      note: form.note || null,
      image_url: imageUrl,
      image_filename: imageFilename,
    };

    try {
      if (editing) {
        await updateProduct(editing.id, data);
      } else {
        await createProduct(data);
      }
      closeModal();
      router.refresh();
    } catch (err) {
      alert("儲存失敗：" + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!confirm(`確定要刪除「${product.name}」嗎？`)) return;
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      router.refresh();
    } catch (err) {
      alert("刪除失敗：" + (err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const displayImage = imagePreview ?? currentImageUrl;

  async function downloadAllLabels() {
    // 有勾選則只下載勾選商品，否則下載全部
    const targets =
      selectedIds.size > 0
        ? initialProducts.filter((p) => selectedIds.has(p.id))
        : initialProducts;

    if (targets.length === 0) { alert("沒有可下載的商品"); return; }
    setBatchDownloading(true);

    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Labels");
      ws.columns = [
        { width: 32 },
        { width: 10 },
        { width: 20 },
      ];

      for (const p of targets) {
        const sku = p.sku || generateSku();
        ws.addRow([p.name, p.price, sku]);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "YXX-labels.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBatchDownloading(false);
    }
  }

  const filtered = searchQuery.trim()
    ? initialProducts.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.categories?.name ?? "").toLowerCase().includes(q)
        );
      })
    : initialProducts;

  const filteredIds = filtered.map((p) => p.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-800">商品管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadAllLabels}
            disabled={batchDownloading}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg"
          >
            {batchDownloading
              ? "產生中..."
              : selectedIds.size > 0
              ? `📥 匯出已選 ${selectedIds.size} 件`
              : "📥 匯出全部標籤"}
          </button>
          <button
            onClick={openAdd}
            className="bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-lg font-medium"
          >
            + 新增商品
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {initialProducts.length > 0 && (
        <div className="mb-4">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜尋商品名稱、SKU 或分類..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
          />
          {searchQuery && (
            <p className="text-xs text-gray-400 mt-1.5 ml-1">
              找到 {filtered.length} 筆結果
            </p>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-pink-50 border border-pink-200 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-pink-700 flex-1">
            已選取 {selectedIds.size} 件商品
          </span>
          <button
            onClick={() => (allFilteredSelected ? clearSelection() : selectAll(filteredIds))}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-white"
          >
            {allFilteredSelected ? "取消全選" : "全選"}
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg"
          >
            {bulkDeleting ? "刪除中..." : `🗑️ 刪除 ${selectedIds.size} 件`}
          </button>
          <button
            onClick={clearSelection}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Product List */}
      {initialProducts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-lg">還沒有商品</p>
          <p className="text-sm mt-1">點「新增商品」或到「匯入商品」頁面批次匯入</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-2">🔍</div>
          <p className="text-sm">找不到符合「{searchQuery}」的商品</p>
        </div>
      ) : (
        <>
          {/* Select All hint when none selected */}
          {selectedIds.size === 0 && filtered.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => selectAll(filteredIds)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <span className="w-4 h-4 border-2 border-gray-300 rounded inline-block" />
                全選 {filtered.length} 件
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product) => {
              const isLow = product.stock > 0 && product.stock <= product.low_stock_threshold;
              const isOut = product.stock <= 0;
              const isSelected = selectedIds.has(product.id);

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all ${
                    isSelected ? "ring-2 ring-pink-400 shadow-md" : ""
                  }`}
                >
                  {/* Image with checkbox */}
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        🧶
                      </div>
                    )}
                    {/* Checkbox overlay */}
                    <button
                      onClick={() => toggleSelect(product.id)}
                      className={`absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? "bg-pink-500 border-pink-500 text-white"
                          : "bg-white bg-opacity-90 border-gray-300 hover:border-pink-400"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    {isOut && (
                      <div className="absolute top-2 right-2 bg-gray-500 text-white text-xs px-2 py-1 rounded-full">
                        缺貨
                      </div>
                    )}
                    {!isOut && isLow && (
                      <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                        低庫存
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="font-medium text-gray-800 truncate">{product.name}</div>
                    {product.sku && (
                      <div className="text-xs text-gray-400">SKU: {product.sku}</div>
                    )}
                    <div className="text-xs text-gray-400">
                      {product.categories?.name ?? "未分類"}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-pink-600 font-bold">${product.price}</span>
                      <span className={`text-sm ${isOut ? "text-gray-400" : isLow ? "text-red-500 font-medium" : "text-gray-500"}`}>
                        庫存 {product.stock}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 mt-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(product)}
                          className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDuplicate(product)}
                          disabled={duplicatingId === product.id}
                          className="flex-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg disabled:opacity-50"
                        >
                          {duplicatingId === product.id ? "複製中..." : "複製"}
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          disabled={deletingId === product.id}
                          className="flex-1 text-sm bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg disabled:opacity-50"
                        >
                          {deletingId === product.id ? "刪除中..." : "刪除"}
                        </button>
                      </div>
                      <button
                        onClick={() => downloadLabel(product)}
                        className="w-full text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg font-medium"
                      >
                        🏷️ 下載 QR 標籤
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-lg">
                {editing ? "編輯商品" : "新增商品"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="px-6 py-4 space-y-4 overflow-y-auto"
            >
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品圖片
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video bg-gray-100 rounded-xl flex items-center justify-center cursor-pointer hover:bg-gray-200 overflow-hidden border-2 border-dashed border-gray-200 hover:border-pink-300"
                >
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt="預覽"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-gray-400">
                      <div className="text-3xl mb-1">📷</div>
                      <div className="text-sm">點擊上傳圖片</div>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* SKU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU（選填）
                </label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="商品編號"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  品名 *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="商品名稱"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分類
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value="">請選擇分類</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price & Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    定價（元）*
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    成本（元）
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
              </div>

              {/* Stock & Threshold */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    庫存數量
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    低庫存警戒
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.low_stock_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  備註
                </label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                  placeholder="備註（選填）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pb-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-medium rounded-xl"
                >
                  {loading ? "儲存中..." : editing ? "更新商品" : "新增商品"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
