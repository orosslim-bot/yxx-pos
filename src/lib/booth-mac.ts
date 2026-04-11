/**
 * C4 防護：以 HMAC-SHA256 簽名攤位 session cookie
 * 使用 Web Crypto API，相容 Edge runtime（proxy/middleware）與 Node.js
 */
const ALG = { name: "HMAC", hash: "SHA-256" } as const;
const enc = new TextEncoder();

function toBase64url(buf: ArrayBuffer): string {
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice(0, (4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return new Uint8Array(Array.from(bin, (c) => c.charCodeAt(0)));
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.BOOTH_SESSION_SECRET ?? "fallback-change-me-in-env";
  return crypto.subtle.importKey("raw", enc.encode(secret), ALG, false, ["sign", "verify"]);
}

export async function signBoothSession(boothId: number | string, boothName: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign(ALG, key, enc.encode(`${boothId}:${boothName}`));
  return toBase64url(sig);
}

export async function verifyBoothSession(boothId: string, boothName: string, sig: string): Promise<boolean> {
  try {
    const key = await getKey();
    return crypto.subtle.verify(ALG, key, fromBase64url(sig), enc.encode(`${boothId}:${boothName}`));
  } catch {
    return false;
  }
}
