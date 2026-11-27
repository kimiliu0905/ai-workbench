import path from "node:path";
import { backupDesktopData } from "@/lib/ops/backup";
import { readServerApiKey } from "@/lib/auth/secrets";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

function userDataDir() {
  return process.env.APP_USER_DATA_DIR || path.resolve(process.cwd());
}

export async function GET() {
  return ok({
    keyConfigured: readServerApiKey().length > 0,
    backupNote: "备份复制本机数据库和图片，不包含密钥文件，也不出现在日常设置页。",
  });
}

export async function POST() {
  try {
    const root = userDataDir();
    const result = await backupDesktopData(root, process.env.APP_DESKTOP_BACKUP_DIR || path.join(root, "..", "椰子酱电商工作台-备份"));
    return ok(result);
  } catch (error) { return handleRouteError(error); }
}
