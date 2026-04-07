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

// T40*20 = 40mm × 20mm → 以 400×200px 繪製
export async function drawLabel(product: LabelProduct): Promise<HTMLCanvasElement> {
  const W = 400;
  const H = 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 白底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const sku = product.sku ?? generateSku();

  // ── 上方：品名 ──
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // 自動縮字，最多兩行
  const name = product.name;
  const maxW = W - 24;
  let fontSize = 22;
  ctx.font = `bold ${fontSize}px sans-serif`;

  // 若名稱太長就縮小字體
  while (ctx.measureText(name).width > maxW * 2 && fontSize > 12) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }

  const lineH = fontSize + 4;
  const words = [...name]; // 逐字元拆
  let line1 = "";
  let line2 = "";
  let overflow = false;
  for (const ch of words) {
    if (ctx.measureText(line1 + ch).width <= maxW) {
      line1 += ch;
    } else if (!overflow && ctx.measureText(line2 + ch).width <= maxW) {
      line2 += ch;
    } else {
      overflow = true;
    }
  }
  if (overflow && line2.length > 0) {
    // 截斷第二行加省略號
    while (ctx.measureText(line2 + "…").width > maxW && line2.length > 0) {
      line2 = line2.slice(0, -1);
    }
    line2 += "…";
  }

  const nameY = 8;
  ctx.fillText(line1, W / 2, nameY);
  if (line2) ctx.fillText(line2, W / 2, nameY + lineH);

  // ── 中間：價格 ──
  ctx.font = "bold 40px sans-serif";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`$${product.price}`, W / 2, 90);

  // ── 下方：條形碼（無數字）──
  const barcodeCanvas = document.createElement("canvas");
  JsBarcode(barcodeCanvas, sku, {
    format: "CODE128",
    displayValue: false, // 不顯示數字
    width: 2,
    height: 52,
    margin: 0,
    lineColor: "#000000",
    background: "#ffffff",
  });

  // 置中貼到底部
  const bw = Math.min(barcodeCanvas.width, W - 20);
  const bx = (W - bw) / 2;
  const by = H - barcodeCanvas.height - 8;
  ctx.drawImage(barcodeCanvas, bx, by, bw, barcodeCanvas.height);

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
