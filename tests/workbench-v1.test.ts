import assert from "node:assert/strict";
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
  for (const label of ["首页", "聊天", "做一张图", "做一套图", "译图", "Agent", "素材库"]) assert.match(shell, new RegExp(label));
  assert.doesNotMatch(shell, /小红书|监控|热力图|API 配置/);
  const login = await readFile("app/login/page.tsx", "utf8");
  assert.match(login, /输入共享口令进入/);
  assert.doesNotMatch(login, /apiKey|API Key|演示口令/);
});
