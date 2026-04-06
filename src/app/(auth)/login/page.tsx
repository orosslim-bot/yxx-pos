import { getBooths } from "./actions";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const booths = await getBooths();
  return (
    <div className="w-full max-w-sm px-6">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🧶</div>
        <h1 className="text-2xl font-bold text-gray-800">楊雪雪針織小舖</h1>
        <p className="text-gray-500 mt-1 text-sm">行動收銀系統</p>
      </div>
      <LoginClient booths={booths} />
    </div>
  );
}
