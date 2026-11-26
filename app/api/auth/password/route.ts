import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { readWorkbenchSecrets, writeWorkbenchSecrets } from "@/lib/auth/secrets";
import { SESSION_COOKIE, readRequestSession, sessionSecret } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { fail } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readRequestSession();
  const secrets = readWorkbenchSecrets();
  if (!session || session.v !== (secrets.passwordVersion || Number(process.env.WORKBENCH_PASSWORD_VERSION || "0"))) {
    return fail("UNAUTHORIZED", "请先输入当前共享口令。", null, 401);
  }
  const body = await request.json().catch(() => ({})) as { currentPassword?: string; nextPassword?: string };
  const hash = secrets.passwordHash || process.env.WORKBENCH_PASSWORD_HASH || "";
  if (!await verifyPassword(body.currentPassword || "", hash)) return fail("INVALID_PASSWORD", "当前口令不正确。", null, 401);
  const nextPassword = body.nextPassword?.trim() || "";
  if (nextPassword.length < 4) return fail("INVALID_PASSWORD", "新口令至少 4 个字符。");
  const passwordHash = await hashPassword(nextPassword);
  const passwordVersion = secrets.passwordVersion + 1;
  writeWorkbenchSecrets({ ...secrets, passwordHash, passwordVersion });
  const response = NextResponse.json({ success: true, data: { ok: true } });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(sessionSecret(), passwordVersion), { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 60 * 60 * 24 * 30 });
  return response;
}
