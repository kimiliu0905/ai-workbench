const { DatabaseSync } = require("node:sqlite");
const { createHash } = require("node:crypto");
const { resolveSqliteDatabasePath } = require("./runtime-paths.cjs");

const textModels = ["gpt-6-luna", "gpt-6.2-sol", "gpt-6.1-terra"];
const imageModels = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"];
const defaultText = "gpt-6-luna";
const defaultImage = "gpt-image-2.6-flare";

function idFor(value) {
  return `desk${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function seedDesktopDefaults() {
  if (process.env.APP_RUNTIME !== "desktop") return { skipped: true };
  const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
  const databasePath = resolveSqliteDatabasePath(databaseUrl.split("?")[0], { cwd: process.cwd() });
  const db = new DatabaseSync(databasePath);
  const now = new Date().toISOString();
  const baseUrl = (process.env.LOCK_BASE_URL || "https://api.openai.com/v1").trim();
  db.exec("BEGIN");
  try {
    const settings = db.prepare('SELECT id FROM "WorkbenchSettings" WHERE id = ?').get("default");
    if (!settings) {
      db.prepare('INSERT INTO "WorkbenchSettings" ("id", "textModelId", "imageModelId", "updatedAt") VALUES (?, ?, ?, ?)').run("default", defaultText, defaultImage, now);
    }
    const provider = db.prepare('SELECT id FROM "ProviderConfig" WHERE "isActive" = 1 LIMIT 1').get();
    if (!provider) {
      const providerId = idFor(`provider:${baseUrl}`);
      db.prepare('INSERT INTO "ProviderConfig" ("id", "name", "baseUrl", "textProtocol", "structuredOutputMode", "apiKeyEncrypted", "isActive", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        providerId, "本机模型服务", baseUrl, "chat_completions", "json_schema", "", 1, now, now,
      );
      const insertModel = db.prepare('INSERT INTO "ModelProfile" ("id", "providerConfigId", "modelId", "label", "capabilities", "roles", "isAvailable", "isDefaultAnalysis", "isDefaultPlanning", "isDefaultHeroImage", "isDefaultDetailImage", "isDefaultImageEdit", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const modelId of textModels) {
        insertModel.run(idFor(`text:${modelId}`), providerId, modelId, modelId, JSON.stringify({ text: true, vision: true, structured_output: true }), "{}", 1, modelId === defaultText ? 1 : 0, modelId === defaultText ? 1 : 0, 0, 0, 0, now, now);
      }
      for (const modelId of imageModels) {
        insertModel.run(idFor(`image:${modelId}`), providerId, modelId, modelId, JSON.stringify({ image_gen: true, image_edit: true, real_image_edit: true }), "{}", 1, 0, 0, modelId === defaultImage ? 1 : 0, modelId === defaultImage ? 1 : 0, modelId === defaultImage ? 1 : 0, now, now);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
  return { skipped: false };
}

if (require.main === module) seedDesktopDefaults();

module.exports = { seedDesktopDefaults };
