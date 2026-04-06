"use client";

import { useState } from "react";
import { uploadLinePayQr } from "./actions";
import { useRouter } from "next/navigation";

export default function LinePayClient({
  currentQrUrl,
}: {
  currentQrUrl: string | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    setError(null);
    setSuccess(false);
    const result = await uploadLinePayQr(formData);
    setUploading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      form.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">目前的 QR Code</h2>
        {currentQrUrl ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentQrUrl} alt="LinePay QR" className="w-48 h-48 object-contain border rounded-xl" />
            <p className="text-xs text-green-600">✅ QR Code 已設定</p>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">📱</div>
            <p className="text-sm">尚未上傳 QR Code</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          {currentQrUrl ? "更換 QR Code" : "上傳 QR Code"}
        </h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            name="file"
            accept="image/*"
            required
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
          />
          {error && <p className="text-red-600 text-sm">❌ {error}</p>}
          {success && <p className="text-green-600 text-sm">✅ 上傳成功！</p>}
          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-medium py-3 rounded-xl"
          >
            {uploading ? "上傳中..." : "上傳 QR Code"}
          </button>
        </form>
      </div>

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">📋 Supabase 設定步驟</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-600 text-xs">
          <li>進入 Supabase Dashboard → Storage</li>
          <li>建立 Bucket，名稱：<code className="bg-blue-100 px-1 rounded">linepay-qr</code>，設為 Public</li>
          <li>回到此頁面上傳 LinePay 收款 QR Code</li>
        </ol>
      </div>
    </div>
  );
}
