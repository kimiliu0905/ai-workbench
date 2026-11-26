import { hashPassword } from "@/lib/auth/password";
import { hasPasswordConfigured, readWorkbenchSecrets, writeWorkbenchSecrets } from "@/lib/auth/secrets";
import { SESSION_COOKIE, sessionSecret } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { fail } from "@/lib/utils/route";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (hasPasswordConfigured() || readWorkbenchSecrets().passwordHash) return fail("SETUP_CLOSED", "共享口令已经设置，请在设置页修改。", null, 409);
  const body = await request.json().catch(() => ({})) as { password?: string };
  const password = body.password?.trim() || "";
  if (password.length < 4) return fail("INVALID_PASSWORD", "共享口令至少 4 个字符。");
  const current = readWorkbenchSecrets();
  const passwordHash = await hashPassword(password);
  const passwordVersion = Math.max(1, current.passwordVersion + 1);
  writeWorkbenchSecrets({ ...current, passwordHash, passwordVersion });
  const secret = sessionSecret();
  if (secret.length < 12) return fail("UNAUTHORIZED", "本机会话密钥尚未就绪。", null, 500);
  const response = NextResponse.json({ success: true, data: { ok: true } });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret, passwordVersion), { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 60 * 60 * 24 * 30 });
  return response;
}
