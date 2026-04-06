import QRCode from "qrcode";

export type LabelProduct = {
  sku: string | null | undefined;
  name: string;
  price: number;
};

export async function drawLabel(product: LabelProduct): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 400, 240);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 398, 238);

  const sku = product.sku ?? "000000";
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, sku, { width: 160, margin: 1, color: { dark: "#111111", light: "#ffffff" } });
  ctx.drawImage(qrCanvas, 20, 40, 160, 160);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(195, 20);
  ctx.lineTo(195, 220);
  ctx.stroke();

  ctx.fillStyle = "#111111";
  ctx.font = "bold 20px sans-serif";
  ctx.textBaseline = "top";
  const name = product.name;
  const maxW = 185;
  const x = 205;
  let y = 30;
  let line = "";
  let lineCount = 0;
  for (const char of name) {
    const test = line + char;
    if (ctx.measureText(test).width > maxW && lineCount < 1) {
      ctx.fillText(line, x, y);
      line = char;
      y += 28;
      lineCount++;
    } else {
      line = test;
    }
  }
  if (line) {
    const displayLine = ctx.measureText(line).width > maxW ? line.slice(0, 10) + "…" : line;
    ctx.fillText(displayLine, x, y);
  }

  ctx.font = "bold 38px sans-serif";
  ctx.fillStyle = "#ec4899";
  ctx.fillText(`$${product.price}`, x, 130);

  ctx.font = "14px monospace";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`SKU: ${sku}`, x, 190);

  return canvas;
}

export async function downloadLabel(product: LabelProduct): Promise<void> {
  if (!product.sku) { alert("此商品沒有 SKU，無法產生標籤"); return; }
  const canvas = await drawLabel(product);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `label-${product.sku}.png`;
  link.click();
}
