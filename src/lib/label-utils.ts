import JsBarcode from "jsbarcode";

export type LabelProduct = {
  sku: string | null | undefined;
  name: string;
  price: number;
};

// 自動生成 SKU（8 位數字）
export function generateSku(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// 單行截斷，超出加 …
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * 精臣 T40×20 標籤（400×200px）
 * MUJI 極簡風格：純黑文字、白底、圓角容器、無彩色
 */
export async function drawLabel(product: LabelProduct): Promise<HTMLCanvasElement> {
  const W = 400;
  const H = 200;
  const R = 20;         // 圓角半徑
  const PAD_X = 24;     // 水平內邊距

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── 圓角白底容器 ──
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#EEEEEE";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── 裁切到圓角範圍內 ──
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, R);
  ctx.clip();

  const sku = product.sku ?? generateSku();

  // ── 品名（頂部，24px，黑色，單行截斷）──
  ctx.font = "24px 'Noto Sans TC', system-ui, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const nameText = truncate(ctx, product.name, W - PAD_X * 2);
  ctx.fillText(nameText, W / 2, 18);

  // ── 價格（垂直置中，60px，無 $ 符號）──
  ctx.font = "500 60px 'Noto Sans TC', system-ui, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(product.price), W / 2, 95);

  // ── 條碼（底部，80% 寬，60px 高，無數字）──
  const barcodeCanvas = document.createElement("canvas");
  const barcodeW = Math.round(W * 0.8); // 320px
  const barcodeH = 60;

  JsBarcode(barcodeCanvas, sku, {
    format: "CODE128",
    displayValue: false,
    width: 2,
    height: barcodeH,
    margin: 0,
    lineColor: "#000000",
    background: "#FFFFFF",
  });

  // 等比縮放貼至底部置中
  const srcW = barcodeCanvas.width;
  const srcH = barcodeCanvas.height;
  const dstX = (W - barcodeW) / 2; // x = 40
  const dstY = H - barcodeH - 12;  // 離底 12px
  ctx.drawImage(barcodeCanvas, 0, 0, srcW, srcH, dstX, dstY, barcodeW, barcodeH);

  ctx.restore();

  return canvas;
}

export async function downloadLabel(product: LabelProduct): Promise<void> {
  const sku = product.sku ?? generateSku();
  const canvas = await drawLabel({ ...product, sku });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `label-${sku}.png`;
  link.click();
}
