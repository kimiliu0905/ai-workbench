import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gateDecision, isPublicPath } from "@/lib/auth/gate";
import { readSessionToken } from "@/lib/auth/token";

const COOKIE = "yzj_session";

function runtimeEnv(name: string) {
  return globalThis.process?.env?.[name];
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const windowToken = runtimeEnv("WORKBENCH_WINDOW_TOKEN");
  if (windowToken && request.headers.get("x-workbench-window") !== windowToken) {
    return new NextResponse(null, { status: 403 });
  }
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== `${request.nextUrl.protocol}//${request.headers.get("host")}`)) {
      return new NextResponse(null, { status: 403 });
    }
  }
  if (isPublicPath(pathname) && pathname !== "/login" && pathname !== "/api/auth/setup") return NextResponse.next();
  const hasPassword = Boolean(runtimeEnv("WORKBENCH_PASSWORD_HASH")?.trim());
  const requireAuth = runtimeEnv("WORKBENCH_REQUIRE_AUTH") === "1" || (runtimeEnv("APP_RUNTIME") === "desktop" && hasPassword);
  const passwordVersion = Number(runtimeEnv("WORKBENCH_PASSWORD_VERSION") || "0");
  const claims = await readSessionToken(runtimeEnv("APP_SECRET") || "", request.cookies.get(COOKIE)?.value);
  const decision = gateDecision({ pathname, claims, requireAuth, hasPassword, passwordVersion: Number.isFinite(passwordVersion) ? passwordVersion : 0 });
  if (decision === "allow") return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "请先输入共享口令。" } }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand-icon.ico|fonts/).*)"],
};
