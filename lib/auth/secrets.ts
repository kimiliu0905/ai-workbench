import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";

export type WorkbenchSecrets = {
  passwordHash: string;
  passwordVersion: number;
  openaiApiKey: string;
  lockBaseUrl: string;
  openaiApiKeyEncrypted?: string;
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
  const file = secretsPath() || path.resolve(".env.workbench-secrets.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WorkbenchSecrets>;
    return {
      passwordHash: typeof parsed.passwordHash === "string" ? parsed.passwordHash : "",
      passwordVersion: Number.isInteger(parsed.passwordVersion) ? Number(parsed.passwordVersion) : 0,
      openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey.trim() : "",
      openaiApiKeyEncrypted: typeof parsed.openaiApiKeyEncrypted === "string" ? parsed.openaiApiKeyEncrypted : undefined,
      lockBaseUrl: typeof parsed.lockBaseUrl === "string" ? parsed.lockBaseUrl.trim() : "",
    };
  } catch {
    return { ...empty };
  }
}

export function writeWorkbenchSecrets(next: WorkbenchSecrets) {
  const file = secretsPath();
  if (!file) throw new Error("本机密钥文件路径未配置。");
  writeSecretsFile(file, next);
  const payload = next;
  process.env.WORKBENCH_PASSWORD_HASH = payload.passwordHash;
  process.env.WORKBENCH_PASSWORD_VERSION = String(payload.passwordVersion);
  if (payload.lockBaseUrl) process.env.LOCK_BASE_URL = payload.lockBaseUrl;
}

function writeSecretsFile(file: string, payload: WorkbenchSecrets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function saveServerApiKey(key: string) {
  const file = secretsPath() || path.resolve(".env.workbench-secrets.json");
  writeSecretsFile(file, { ...readWorkbenchSecrets(), openaiApiKey: "", openaiApiKeyEncrypted: encryptSecret(key) });
}

export function readLegacyApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || readWorkbenchSecrets().openaiApiKey;
}

export function readServerApiKey() {
  const saved = readWorkbenchSecrets();
  if (saved.openaiApiKeyEncrypted) {
    try { return decryptSecret(saved.openaiApiKeyEncrypted); } catch { /* configuration may have been copied from another installation */ }
  }
  return process.env.OPENAI_API_KEY?.trim() || saved.openaiApiKey;
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
