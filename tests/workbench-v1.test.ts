import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";

let directory = "";
let db: typeof import("../lib/db/prisma").prisma;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "yezijian-workbench-"));
  const filename = path.join(directory, "test.db");
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const sqlite = new DatabaseSync(filename);
  const migrations = path.resolve("prisma/migrations");
  for (const entry of (await readdir(migrations, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    sqlite.exec(await readFile(path.join(migrations, entry.name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${filename.replaceAll("\\", "/")}`;
  process.env.STORAGE_ROOT = path.join(directory, "storage");
  process.env.APP_SECRET = "workbench-test-secret";
  delete process.env.OPENAI_API_KEY;
  delete process.env.WORKBENCH_SECRETS_PATH;
  delete process.env.APP_RUNTIME;
  delete process.env.WORKBENCH_REQUIRE_AUTH;
  db = (await import("../lib/db/prisma")).prisma;
});

after(async () => {
  await db?.$disconnect();
  if (directory && path.basename(directory).startsWith("yezijian-workbench-")) await rm(directory, { recursive: true, force: true });
});

test("desktop identity stays off MxPage and binds only to loopback", async () => {
  const product = createRequire(import.meta.url)("../desktop/product.cjs");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const main = await readFile("desktop/main.cjs", "utf8");
  assert.equal(product.PRODUCT_NAME, "椰子酱电商工作台");
  assert.equal(product.DESKTOP_BIND_HOST, "127.0.0.1");
  assert.equal(product.USER_DATA_DIR_NAME, "椰子酱电商工作台");
  assert.equal(pkg.build.appId, "com.yezijian.ecommerce-workbench");
  assert.equal(pkg.build.productName, "椰子酱电商工作台");
  assert.equal(pkg.build.executableName, "YezijianWorkbench");
  assert.match(main, /DESKTOP_BIND_HOST/);
  assert.doesNotMatch(main, /0\.0\.0\.0/);
  assert.doesNotMatch(main, /APPDATA%\/MxPage|userData", "MxPage"/);
});

test("shared password hash and session version stay out of the renderer", async () => {
  const { hashPassword, verifyPassword } = await import("../lib/auth/password");
  const { createSessionToken, readSessionToken } = await import("../lib/auth/token");
  const { gateDecision } = await import("../lib/auth/gate");
  const hash = await hashPassword("shared-pass");
  assert.equal(hash.includes("shared-pass"), false);
  assert.equal(await verifyPassword("shared-pass", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  const token = await createSessionToken("workbench-test-secret", 2);
  const claims = await readSessionToken("workbench-test-secret", token);
  assert.equal(claims?.v, 2);
  assert.equal(gateDecision({ pathname: "/chat", claims, requireAuth: true, hasPassword: true, passwordVersion: 2 }), "allow");
  assert.equal(gateDecision({ pathname: "/chat", claims, requireAuth: true, hasPassword: true, passwordVersion: 3 }), "login");
  assert.equal(gateDecision({ pathname: "/api/auth/login", claims: null, requireAuth: true, hasPassword: true, passwordVersion: 2 }), "allow");
  assert.equal(gateDecision({ pathname: "/", claims: null, requireAuth: false, hasPassword: false, passwordVersion: 0 }), "allow");
});

test("desktop runtime ignores renderer API key headers", async () => {
  const { resolveRequestApiKey } = await import("../lib/auth/credentials");
  assert.equal(resolveRequestApiKey({ serverKey: "server-key", header: "renderer-key", explicit: "form-key", desktop: true }), "server-key");
  assert.equal(resolveRequestApiKey({ header: "renderer-key", explicit: "form-key", desktop: true }), "");
  assert.equal(resolveRequestApiKey({ header: "renderer-key", desktop: false }), "renderer-key");
  const bridge = await readFile("components/layout/provider-credential-fetch-bridge.tsx", "utf8");
  assert.match(bridge, /headers\.delete\("x-mxpage-api-key"\)/);
  assert.doesNotMatch(bridge, /localStorage\.getItem/);
  const settings = await readFile("app/settings/page.tsx", "utf8");
  const models = await readFile("lib/product.ts", "utf8");
  assert.doesNotMatch(settings, /apiKey|API Key|x-mxpage-api-key|localStorage/);
  assert.match(settings, /默认文本模型/);
  assert.match(settings, /默认生图模型/);
  assert.match(models, /gpt-6-luna/);
  assert.match(models, /gpt-6\.2-sol/);
  assert.match(models, /gpt-6\.1-terra/);
  assert.match(models, /gpt-image-2\.6-flare/);
  assert.match(models, /gpt-image-2\.6-sunburst/);
});

test("size policy locks illegal targets and keeps 2.6 square sizes legal", async () => {
  const { planImageSize, finishImageToTarget, isLegalImageSize } = await import("../lib/image/size-policy");
  assert.equal(isLegalImageSize(1024, 1024, "gpt-image-2.6-flare"), true);
  assert.equal(isLegalImageSize(800, 800, "gpt-image-2.6-flare"), true);
  assert.equal(isLegalImageSize(800, 800, "gpt-image-2.5-flare"), false);
  const odd = planImageSize(801, 800, "gpt-image-2.6-flare");
  assert.equal(odd.legal, false);
  assert.equal(odd.requestWidth % 16, 0);
  assert.equal(odd.requestHeight % 16, 0);
  assert.match(odd.note, /801×800/);
  assert.match(odd.note, /不会拉伸/);
  const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#fff" } }).png().toBuffer();
  const finished = await finishImageToTarget(source, { width: 801, height: 800 });
  const meta = await sharp(finished).metadata();
  assert.equal(meta.width, 801);
  assert.equal(meta.height, 800);
  const same = await finishImageToTarget(source, { width: 40, height: 20 });
  assert.equal(same, source);
});

test("asset library keeps the three approved defaults and task copies", async () => {
  const library = await import("../lib/workbench/library");
  assert.equal(library.librarySavePolicy("compose-input"), true);
  assert.equal(library.librarySavePolicy("set-input"), true);
  assert.equal(library.librarySavePolicy("translate-input"), true);
  assert.equal(library.librarySavePolicy("chat"), false);
  assert.equal(library.librarySavePolicy("generated"), false);
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ddd" } }).png().toBuffer();
  const saved = await library.addLibraryAsset({ name: "保温杯.png", source: "compose", buffer: png, mimeType: "image/png" });
  assert.equal(saved.name, "保温杯");
  const copied = await library.copyLibraryAsset(saved.id, "task-a");
  const before = await library.readLibraryBytes(copied.copyPath);
  const replacement = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#111" } }).png().toBuffer();
  await library.replaceLibraryAsset(saved.id, replacement, "image/png");
  assert.deepEqual(await library.readLibraryBytes(copied.copyPath), before);
  await library.deleteLibraryAsset(saved.id);
  assert.equal(await db.libraryAsset.count(), 0);
  assert.deepEqual(await library.readLibraryBytes(copied.copyPath), before);
});

test("chat attachments are not library assets and the shell hides removed entries", async () => {
  const { saveChatAttachment } = await import("../lib/workbench/chat");
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#abc" } }).png().toBuffer();
  const before = await db.libraryAsset.count();
  const saved = await saveChatAttachment(png, "image/png");
  assert.match(saved.relative, /^chat\//);
  assert.equal(await db.libraryAsset.count(), before);
  const shell = await readFile("components/layout/app-shell.tsx", "utf8");
  for (const label of ["首页", "聊天", "做一张图", "做一套图", "译图", "Agent"]) assert.match(shell, new RegExp(label));
  assert.doesNotMatch(shell, /素材库|href="\/library"|小红书|监控|热力图|API 配置/);
  const login = await readFile("app/login/page.tsx", "utf8");
  assert.match(login, /输入共享口令进入/);
  assert.doesNotMatch(login, /apiKey|API Key|演示口令/);
});

test("desktop broker is only the Electron channel, not Next's process.send", async () => {
  const { desktopBridgeAvailable } = await import("../lib/agent/desktop");
  const send = () => undefined;
  assert.equal(desktopBridgeAvailable({ APP_RUNTIME: "desktop" }, send), false);
  assert.equal(desktopBridgeAvailable({ APP_RUNTIME: "desktop", WORKBENCH_DESKTOP_BROKER: "1" }, undefined), false);
  assert.equal(desktopBridgeAvailable({ WORKBENCH_DESKTOP_BROKER: "1" }, send), false);
  assert.equal(desktopBridgeAvailable({ APP_RUNTIME: "desktop", WORKBENCH_DESKTOP_BROKER: "1" }, send), true);
  const main = await readFile("desktop/main.cjs", "utf8");
  assert.match(main, /WORKBENCH_DESKTOP_BROKER: "1"/);
  assert.match(main, /stdio: \["ignore", "pipe", "pipe", "ipc"\]/);
});

test("desktop startup creates the default provider without storing the API key", async () => {
  const config = await readFile("next.config.mjs", "utf8");
  const main = await readFile("desktop/main.cjs", "utf8");
  const hook = await readFile("instrumentation.ts", "utf8");
  const layout = await readFile("app/layout.tsx", "utf8");
  assert.match(config, /instrumentationHook:\s*true/);
  assert.match(main, /ensure-desktop-defaults\.cjs/);
  assert.match(hook, /ensureDesktopDefaults/);
  assert.match(layout, /ensureDesktopDefaults/);
  const { sqliteDatabaseUrl } = await import("../lib/db/prisma");
  assert.equal(sqliteDatabaseUrl("file:/tmp/workbench.db"), "file:/tmp/workbench.db?socket_timeout=60&connection_limit=1");
  assert.equal(sqliteDatabaseUrl("file:/tmp/workbench.db?mode=rw"), "file:/tmp/workbench.db?mode=rw&socket_timeout=60&connection_limit=1");
  assert.equal(sqliteDatabaseUrl("postgresql://localhost/app"), "postgresql://localhost/app");

  const previousRuntime = process.env.APP_RUNTIME;
  const previousLock = process.env.LOCK_BASE_URL;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.APP_RUNTIME = "desktop";
  process.env.LOCK_BASE_URL = "https://lock.example/v1";
  process.env.OPENAI_API_KEY = "should-not-be-stored";
  try {
    const { ensureDesktopDefaults } = await import("../lib/workbench/settings");
    await ensureDesktopDefaults();
    const settings = await db.workbenchSettings.findUnique({ where: { id: "default" } });
    assert.equal(settings?.textModelId, "gpt-6-luna");
    assert.equal(settings?.imageModelId, "gpt-image-2.6-flare");
    const provider = await db.providerConfig.findFirst({ where: { isActive: true }, include: { models: true } });
    assert.ok(provider);
    assert.equal(provider.apiKeyEncrypted, "");
    assert.equal(provider.baseUrl, "https://lock.example/v1");
    assert.equal(provider.models.some(model => model.modelId === "gpt-6-luna" && model.isDefaultAnalysis), true);
    assert.equal(provider.models.some(model => model.modelId === "gpt-image-2.6-flare" && model.isDefaultHeroImage), true);
    assert.equal(JSON.stringify(provider).includes("should-not-be-stored"), false);
    await ensureDesktopDefaults();
    assert.equal(await db.providerConfig.count({ where: { isActive: true } }), 1);
    assert.equal(await db.workbenchSettings.count(), 1);
  } finally {
    if (previousRuntime === undefined) delete process.env.APP_RUNTIME;
    else process.env.APP_RUNTIME = previousRuntime;
    if (previousLock === undefined) delete process.env.LOCK_BASE_URL;
    else process.env.LOCK_BASE_URL = previousLock;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }

  const seedFile = path.join(directory, "desktop-seed.db");
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const sqlite = new DatabaseSync(seedFile);
  const migrations = path.resolve("prisma/migrations");
  for (const entry of (await readdir(migrations, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    sqlite.exec(await readFile(path.join(migrations, entry.name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  const seeded = spawnSync(process.execPath, ["scripts/ensure-desktop-defaults.cjs"], {
    cwd: process.cwd(),
    env: { ...process.env, APP_RUNTIME: "desktop", DATABASE_URL: `file:${seedFile.replaceAll("\\", "/")}`, OPENAI_API_KEY: "should-not-be-stored", LOCK_BASE_URL: "https://lock.example/v1" },
    encoding: "utf8",
  });
  assert.equal(seeded.status, 0, seeded.stderr);
  const check = new DatabaseSync(seedFile);
  const row = check.prepare('SELECT "apiKeyEncrypted", "baseUrl" FROM "ProviderConfig" WHERE "isActive" = 1').get() as { apiKeyEncrypted: string; baseUrl: string };
  const settingsRow = check.prepare('SELECT "textModelId", "imageModelId" FROM "WorkbenchSettings" WHERE id = ?').get("default") as { textModelId: string; imageModelId: string };
  check.close();
  assert.equal(row.apiKeyEncrypted, "");
  assert.equal(row.baseUrl, "https://lock.example/v1");
  assert.equal(settingsRow.textModelId, "gpt-6-luna");
  assert.equal(settingsRow.imageModelId, "gpt-image-2.6-flare");
});

test("profile hides the consumption heatmap and a set can copy a library image", async () => {
  const profile = await readFile("app/settings/profile/page.tsx", "utf8");
  const profileView = await readFile("components/settings/user-profile.tsx", "utf8");
  const frame = await readFile("components/layout/workbench-frame.tsx", "utf8");
  const setPage = await readFile("app/set/page.tsx", "utf8");
  assert.doesNotMatch(profile, /listApiUsageEntries|buildUsageActivity|消耗热力图/);
  assert.doesNotMatch(profileView, /最近12个月消耗热力图|消耗记录/);
  assert.match(frame, /return <AppShell>\{children\}<\/AppShell>/);
  assert.doesNotMatch(frame, /正在打开工作台/);
  assert.match(setPage, /从素材库点选/);
  assert.match(setPage, /library-import/);

  const library = await import("../lib/workbench/library");
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#abc" } }).png().toBuffer();
  const saved = await library.addLibraryAsset({ name: "套图素材.png", source: "upload", buffer: png, mimeType: "image/png" });
  const before = await db.libraryAsset.count();
  const project = await db.project.create({ data: { name: "套图任务", platform: "general_ecommerce", style: "generic_clean" } });
  const copied = await library.importLibraryAssetToProject(saved.id, project.id, 0);
  assert.equal(copied.projectId, project.id);
  assert.equal(copied.type, "MAIN");
  assert.equal(await db.libraryAsset.count(), before);
  const replacement = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#111" } }).png().toBuffer();
  await library.replaceLibraryAsset(saved.id, replacement, "image/png");
  const taskBytes = await readFile(path.join(process.env.STORAGE_ROOT || "", copied.filePath));
  assert.equal(taskBytes.equals(png), true);
});

test("product acceptance gaps stay closed in source", async () => {
  const { translationPreviewCopy } = await import("../lib/translation/preview");
  const { defaultProfile } = await import("../lib/profile");
  assert.equal(translationPreviewCopy({ status: "COMPLETED", images: [], translationProgress: { completed: 1, failed: 0, total: 1 } }), "译图已完成。打开对照预览即可查看。");
  assert.equal(translationPreviewCopy({ status: "RUNNING", images: [], translationProgress: { completed: 0, failed: 0, total: 1 } }), "等待译图完成，预览将自动更新。");
  assert.equal(translationPreviewCopy({ status: "COMPLETED", images: [{ id: "a" }], translationProgress: { completed: 1, failed: 0, total: 1 } }), null);
  assert.equal(defaultProfile.username, "yezijian");
  assert.equal(defaultProfile.name, "椰子酱");
  const profileView = await readFile("components/settings/user-profile.tsx", "utf8");
  assert.doesNotMatch(profileView, /仅保存在当前浏览器/);
  const providers = await readFile("components/providers/provider-settings.tsx", "utf8");
  const providerPage = await readFile("app/settings/providers/page.tsx", "utf8");
  assert.doesNotMatch(providers, /id="provider-api-key"|请输入当前浏览器使用的 API Key|请填写 API Key/);
  assert.match(providerPage, /redirect\("\/settings"\)/);
  const history = await readFile("components/projects/recent-project-list.tsx", "utf8");
  const xhsEdit = await readFile("app/xiaohongshu/edit/page.tsx", "utf8");
  const xhsGenerate = await readFile("app/xiaohongshu/generate/page.tsx", "utf8");
  const xhsReview = await readFile("app/xiaohongshu/review/page.tsx", "utf8");
  const libraryPage = await readFile("app/library/page.tsx", "utf8");
  const profileStore = await readFile("components/settings/profile-store.ts", "utf8");
  assert.match(libraryPage, /redirect\("\/"\)/);
  assert.doesNotMatch(profileStore, /localStorage/);
  assert.match(history, /value !== "xiaohongshu"/);
  for (const page of [xhsEdit, xhsGenerate, xhsReview]) assert.match(page, /redirect\("\/"\)/);
  const setPage = await readFile("app/set/page.tsx", "utf8");
  const compose = await readFile("app/compose/page.tsx", "utf8");
  assert.match(setPage, /searchParams\(window\.location\.search\)\.get\("project"\)|get\("project"\)/);
  assert.match(setPage, /只导出选中 ZIP/);
  assert.match(setPage, /选中长图/);
  assert.match(setPage, /排队中/);
  assert.match(compose, /get\("job"\)/);
  assert.match(compose, /继续修改/);
  assert.match(compose, /套用模板/);
  assert.match(compose, /版本列表/);
  const { getWorkbenchProfile, saveWorkbenchProfile } = await import("../lib/workbench/profile");
  assert.equal((await getWorkbenchProfile()).name, "椰子酱");
  assert.equal((await saveWorkbenchProfile({ name: "椰子酱", username: "kimi_desk", avatar: null })).username, "kimi_desk");
  assert.equal((await getWorkbenchProfile()).username, "kimi_desk");
  assert.equal(await db.userProfile.count(), 1);
});
