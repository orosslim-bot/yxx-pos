"use client";

import { useState } from "react";
import { addBooth, updateBooth, deleteBooth } from "./actions";

type Booth = { id: number; name: string; pin: string };

export default function BoothsManager({ booths: initial }: { booths: Booth[] }) {
  const [booths, setBooths] = useState<Booth[]>(initial);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function flash(message: string) {
    setMsg(message);
    setTimeout(() => setMsg(null), 2000);
  }

  function startEdit(b: Booth) {
    setEditId(b.id);
    setEditName(b.name);
    setEditPin(b.pin);
    setError(null);
  }

  async function handleUpdate(id: number) {
    setError(null);
    const res = await updateBooth(id, editName, editPin);
    if (res.error) { setError(res.error); return; }
    setBooths((prev) => prev.map((b) => b.id === id ? { ...b, name: editName, pin: editPin } : b));
    setEditId(null);
    flash("已儲存");
  }

  async function handleDelete(id: number) {
    if (!confirm("確定刪除這個攤位？")) return;
    const res = await deleteBooth(id);
    if (res.error) { setError(res.error); return; }
    setBooths((prev) => prev.filter((b) => b.id !== id));
    flash("已刪除");
  }

  async function handleAdd() {
    setError(null);
    const res = await addBooth(newName, newPin);
    if (res.error) { setError(res.error); return; }
    setNewName("");
    setNewPin("");
    // refresh list
    window.location.reload();
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-800 mb-6">攤位管理</h1>

      {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}

      {/* 攤位列表 */}
      <div className="space-y-3 mb-8">
        {booths.map((b) => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4">
            {editId === b.id ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="攤位名稱"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="PIN 碼（4 位數字）"
                  maxLength={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(b.id)}
                    className="flex-1 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium py-2 rounded-lg"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800">{b.name}</div>
                  <div className="text-sm text-gray-400">PIN：{b.pin}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(b)}
                    className="text-sm text-pink-500 hover:text-pink-700 font-medium"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-sm text-red-400 hover:text-red-600 font-medium"
                  >
                    刪除
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 新增攤位 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">新增攤位</h2>
        <div className="space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="攤位名稱（例：攤位C）"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="PIN 碼（4 位數字）"
            maxLength={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || newPin.length !== 4}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-pink-200 text-white text-sm font-medium py-2 rounded-lg"
          >
            新增攤位
          </button>
        </div>
      </div>
    </div>
  );
}
