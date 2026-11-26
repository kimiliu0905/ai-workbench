const fs = require("node:fs/promises");
const path = require("node:path");

async function copyTree(from, to) {
  let entries;
  try { entries = await fs.readdir(from, { withFileTypes: true }); } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  await fs.mkdir(to, { recursive: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, dest);
    else if (entry.isFile()) await fs.copyFile(source, dest);
  }
}

async function backupDesktopData(userDataDir, destinationRoot) {
  const resolvedUser = path.resolve(userDataDir);
  const resolvedDest = path.resolve(destinationRoot);
  const relative = path.relative(resolvedUser, resolvedDest);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("备份目录不能放在用户数据目录里面。");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(resolvedDest, stamp);
  await fs.mkdir(path.join(target, "prisma"), { recursive: true });
  const database = path.join(resolvedUser, "prisma", "dev.db");
  try { await fs.copyFile(database, path.join(target, "prisma", "dev.db")); } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  await copyTree(path.join(resolvedUser, "storage"), path.join(target, "storage"));
  await fs.writeFile(path.join(target, "README.txt"), "备份包含数据库和图片，不包含密钥文件。\n", "utf8");
  return { directory: target };
}

module.exports = { backupDesktopData };
