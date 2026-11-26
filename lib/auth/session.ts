import { cookies } from "next/headers";
import { readSessionToken } from "./token";
import { currentPasswordVersion, hasPasswordConfigured, isDesktopRuntime, readServerApiKey } from "./secrets";

export const SESSION_COOKIE = "yzj_session";

export function sessionSecret() {
  return process.env.APP_SECRET?.trim() || "";
}

export async function readRequestSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return readSessionToken(sessionSecret(), token);
}

export async function sessionStatus() {
  const required = isDesktopRuntime();
  const hasPassword = hasPasswordConfigured();
  const claims = await readRequestSession();
  const authenticated = !required || (hasPassword && !!claims && claims.v === currentPasswordVersion());
  return {
    required,
    hasPassword,
    needsSetup: required && !hasPassword,
    authenticated: required ? authenticated : true,
    keyConfigured: readServerApiKey().length > 0,
  };
}
