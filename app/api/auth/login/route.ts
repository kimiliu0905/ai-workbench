import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hasPasswordConfigured, readWorkbenchSecrets, writeWorkbenchSecrets } from "@/lib/auth/secrets";
import { SESSION_COOKIE, sessionSecret } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { fail } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

function cookie(token: string) {
  const response = NextResponse.json({ success: true, data: { ok: true } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 60 * 60 * 24 * 30 });
  return response;
}

async function issue(version: number) {
  const secret = sessionSecret();
  if (secret.length < 12) return fail("UNAUTHORIZED", "本机会话密钥尚未就绪。", null, 500);
  return cookie(await createSessionToken(secret, version));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { password?: string };
  const password = body.password || "";
  if (!password.trim()) return fail("INVALID_PASSWORD", "请输入共享口令。");
  const secrets = readWorkbenchSecrets();
  if (!secrets.passwordHash && !hasPasswordConfigured()) return fail("SETUP_REQUIRED", "这台电脑还没有共享口令。", null, 409);
  const hash = secrets.passwordHash || process.env.WORKBENCH_PASSWORD_HASH || "";
  if (!await verifyPassword(password, hash)) return fail("INVALID_PASSWORD", "口令不正确，请再试一次。", null, 401);
  return issue(secrets.passwordVersion || Number(process.env.WORKBENCH_PASSWORD_VERSION || "1"));
}
