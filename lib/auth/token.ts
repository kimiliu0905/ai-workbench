const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(body));
  return bytesToBase64Url(new Uint8Array(signature));
}

export type SessionClaims = { exp: number; v: number };

export async function createSessionToken(secret: string, version: number, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const claims: SessionClaims = { exp: Date.now() + ttlMs, v: version };
  const body = bytesToBase64Url(textEncoder.encode(JSON.stringify(claims)));
  return `${body}.${await sign(secret, body)}`;
}

export async function readSessionToken(secret: string, token?: string | null): Promise<SessionClaims | null> {
  if (!secret || !token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = await sign(secret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (mismatch) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionClaims;
    if (!claims || typeof claims.exp !== "number" || typeof claims.v !== "number") return null;
    if (claims.exp <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
