import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/pos");

  async function handleSignOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/products" className="flex items-center gap-1">
              <span className="text-xl">🧶</span>
              <span className="font-bold text-gray-800">後台管理</span>
            </Link>
            <div className="hidden sm:flex items-center gap-3">
              <Link
                href="/admin/products"
                className="text-sm text-gray-600 hover:text-pink-500"
              >
                商品管理
              </Link>
              <Link
                href="/admin/import"
                className="text-sm text-gray-600 hover:text-pink-500"
              >
                匯入商品
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/pos"
              className="text-sm bg-pink-50 text-pink-600 hover:bg-pink-100 px-3 py-1.5 rounded-lg font-medium"
            >
              收銀台
            </Link>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-sm text-gray-400 hover:text-red-500"
              >
                登出
              </button>
            </form>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="sm:hidden flex gap-3 mt-2">
          <Link
            href="/admin/products"
            className="text-sm text-gray-600 hover:text-pink-500"
          >
            商品管理
          </Link>
          <Link
            href="/admin/import"
            className="text-sm text-gray-600 hover:text-pink-500"
          >
            匯入商品
          </Link>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
