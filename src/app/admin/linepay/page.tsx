import { getLinePayQrUrl } from "./actions";
import LinePayClient from "./LinePayClient";

export default async function LinePayPage() {
  const qrUrl = await getLinePayQrUrl();
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">LinePay QR Code 設定</h1>
      <LinePayClient currentQrUrl={qrUrl} />
    </div>
  );
}
