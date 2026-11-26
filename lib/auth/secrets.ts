import fs from "node:fs";

export type WorkbenchSecrets = {
  passwordHash: string;
  passwordVersion: number;
  openaiApiKey: string;
  lockBaseUrl: string;
};

const empty: WorkbenchSecrets = {
  passwordHash: "",
  passwordVersion: 0,
  openaiApiKey: "",
  lockBaseUrl: "",
};

export function secretsPath() {
  return process.env.WORKBENCH_SECRETS_PATH?.trim() || "";
}

export function readWorkbenchSecrets(): WorkbenchSecrets {
  const file = secretsPath();
  if (!file) return { ...empty };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WorkbenchSecrets>;
    return {
      passwordHash: typeof parsed.passwordHash === "string" ? parsed.passwordHash : "",
      passwordVersion: Number.isInteger(parsed.passwordVersion) ? Number(parsed.passwordVersion) : 0,
      openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey.trim() : "",
      lockBaseUrl: typeof parsed.lockBaseUrl === "string" ? parsed.lockBaseUrl.trim() : "",
    };
  } catch {
    return { ...empty };
  }
}

export function writeWorkbenchSecrets(next: WorkbenchSecrets) {
  const file = secretsPath();
  if (!file) throw new Error("本机密钥文件路径未配置。");
  const directory = file.slice(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")));
  fs.mkdirSync(directory, { recursive: true });
  const payload = {
    passwordHash: next.passwordHash,
    passwordVersion: next.passwordVersion,
    openaiApiKey: next.openaiApiKey,
    lockBaseUrl: next.lockBaseUrl,
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows may ignore the mode. */ }
  process.env.WORKBENCH_PASSWORD_HASH = payload.passwordHash;
  process.env.WORKBENCH_PASSWORD_VERSION = String(payload.passwordVersion);
  if (payload.openaiApiKey) process.env.OPENAI_API_KEY = payload.openaiApiKey;
  if (payload.lockBaseUrl) process.env.LOCK_BASE_URL = payload.lockBaseUrl;
}

export function readServerApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim() || "";
  if (fromEnv) return fromEnv;
  return readWorkbenchSecrets().openaiApiKey;
}

export function isDesktopRuntime() {
  return process.env.APP_RUNTIME === "desktop" || process.env.WORKBENCH_REQUIRE_AUTH === "1";
}

export function currentPasswordVersion() {
  const fromEnv = process.env.WORKBENCH_PASSWORD_VERSION;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);
  return readWorkbenchSecrets().passwordVersion;
}

export function hasPasswordConfigured() {
  if (process.env.WORKBENCH_PASSWORD_HASH?.trim()) return true;
  return readWorkbenchSecrets().passwordHash.length > 0;
}
