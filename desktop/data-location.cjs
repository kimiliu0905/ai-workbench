const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const folderName = "椰子酱工作台数据";
const paths = ["prisma", "storage", "config", "storage-backups", "desktop-backups"];

function locationFile(defaultRoot) {
  return path.join(defaultRoot, "data-location.json");
}

async function readLocation(defaultRoot) {
  try {
    const saved = JSON.parse(await fs.readFile(locationFile(defaultRoot), "utf8"));
    if (typeof saved.directory !== "string" || !path.isAbsolute(saved.directory)) throw new Error("保存的数据目录无效。");
    const database = await fs.stat(path.join(saved.directory, "prisma", "dev.db")).catch(() => null);
    if (!database?.isFile()) throw new Error(`找不到新的数据位置，请检查磁盘是否连接。\n${saved.directory}`);
    return saved;
  } catch (error) {
    if (error.code === "ENOENT") return { directory: defaultRoot };
    throw error;
  }
}

async function writeLocation(defaultRoot, location) {
  const destination = locationFile(defaultRoot);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(location), { mode: 0o600 });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
}

async function chooseDestination(source, selected, protectedPaths = []) {
  const parent = await fs.realpath(selected);
  const destination = path.join(parent, folderName);
  const current = await fs.realpath(source);
  if (contains(current, destination) || contains(destination, current) ||
      protectedPaths.some(root => contains(root, destination))) {
    throw new Error("请选择工作台数据和程序安装目录之外的文件夹。");
  }
  try {
    await fs.lstat(destination);
    throw new Error("所选位置已有「椰子酱工作台数据」文件夹，请选择另一个位置。");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return destination;
}

async function copyTree(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isDirectory()) {
    await fs.mkdir(destination);
    for (const name of await fs.readdir(source)) await copyTree(path.join(source, name), path.join(destination, name));
  } else if (stat.isFile()) {
    await fs.copyFile(source, destination);
    if ((await fs.stat(destination)).size !== stat.size) throw new Error("文件复制未完成。");
  } else {
    throw new Error("数据目录包含链接或不支持的文件，无法安全迁移。");
  }
}

function legacyBackup(source) {
  return path.join(path.dirname(source), "椰子酱电商工作台-备份");
}

async function migrateData(defaultRoot, source, destination) {
  const staging = await fs.mkdtemp(path.join(path.dirname(destination), ".yezijian-transfer-"));
  const sources = paths.map(name => [path.join(source, name), path.join(staging, name)]);
  if (path.relative(defaultRoot, source) === "") {
    sources.push([legacyBackup(source), path.join(staging, "desktop-backups", "迁移前的备份")]);
  }
  let published = false;
  const copied = [];
  try {
    for (const [from, to] of sources) {
      try { await fs.lstat(from); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      await fs.mkdir(path.dirname(to), { recursive: true });
      await copyTree(from, to);
      copied.push(from);
    }
    const db = new DatabaseSync(path.join(staging, "prisma", "dev.db"), { readOnly: true });
    try {
      if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") {
        throw new Error("复制后的数据库未通过校验。");
      }
    } finally { db.close(); }
    await fs.rename(staging, destination);
    published = true;
    await writeLocation(defaultRoot, { directory: destination, previous: source, cleanup: copied });
  } catch (error) {
    await fs.rm(published ? destination : staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function cleanupPrevious(defaultRoot, location) {
  if (typeof location.previous !== "string" || !path.isAbsolute(location.previous) ||
      !Array.isArray(location.cleanup) || !location.cleanup.length) return;
  if (location.previous !== defaultRoot && path.basename(location.previous) !== folderName) return;
  const allowed = paths.map(name => path.join(location.previous, name));
  if (location.previous === defaultRoot) allowed.push(legacyBackup(defaultRoot));
  const remaining = [];
  for (const old of location.cleanup) {
    if (typeof old !== "string" || !path.isAbsolute(old) || contains(location.directory, old) ||
        contains(old, location.directory)) continue;
    if (!allowed.includes(old)) continue;
    try { await fs.rm(old, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); }
    catch { remaining.push(old); }
  }
  if (!remaining.length && location.previous !== defaultRoot) await fs.rmdir(location.previous).catch(() => {});
  await writeLocation(defaultRoot, {
    directory: location.directory,
    ...(remaining.length && { previous: location.previous, cleanup: remaining }),
  });
}

module.exports = { readLocation, chooseDestination, migrateData, cleanupPrevious };
