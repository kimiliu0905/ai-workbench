import type { SessionClaims } from "./token";

export type GateInput = {
  pathname: string;
  claims: SessionClaims | null;
  requireAuth: boolean;
  hasPassword: boolean;
  passwordVersion: number;
};

const publicPaths = new Set(["/login", "/api/auth/login", "/api/auth/setup", "/api/auth/session"]);

export function isPublicPath(pathname: string) {
  if (publicPaths.has(pathname)) return true;
  return pathname.startsWith("/_next") || pathname.startsWith("/fonts/") || pathname === "/favicon.ico" || pathname === "/brand-icon.ico";
}

export function gateDecision(input: GateInput): "allow" | "login" {
  if (!input.requireAuth) return "allow";
  if (isPublicPath(input.pathname)) {
    if (input.pathname === "/login") return "allow";
    if (!input.hasPassword && input.pathname !== "/api/auth/setup" && input.pathname !== "/api/auth/session") return "login";
    if (input.hasPassword && input.pathname === "/api/auth/setup") return "login";
    return "allow";
  }
  if (!input.hasPassword) return "login";
  if (!input.claims || input.claims.v !== input.passwordVersion) return "login";
  return "allow";
}
