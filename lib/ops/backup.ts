import fs from "node:fs/promises";
import path from "node:path";

export async function backupDesktopData(userDataDir: string, destinationRoot: string) {
  const resolvedUser = path.resolve(userDataDir);
  const resolvedDest = path.resolve(destinationRoot);
  const relative = path.relative(resolvedUser, resolvedDest);
  if (relative !== "desktop-backups" && (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)))) throw new Error("备份目录无效。");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(resolvedDest, stamp);
  await fs.mkdir(target, { recursive: true });
  const database = path.join(resolvedUser, "prisma", "dev.db");
  try {
    await fs.mkdir(path.join(target, "prisma"), { recursive: true });
    await fs.copyFile(database, path.join(target, "prisma", "dev.db"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const storage = path.join(resolvedUser, "storage");
  await copyTree(storage, path.join(target, "storage"));
  const note = "备份包含数据库和图片，不包含 config/secrets.json 与 config/runtime.json 中的密钥。\n";
  await fs.writeFile(path.join(target, "README.txt"), note, "utf8");
  return { directory: target };
}

async function copyTree(from: string, to: string) {
  let entries;
  try { entries = await fs.readdir(from, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
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
