import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fail } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId") || "";
  const job = await prisma.composeJob.findUnique({ where: { id: jobId } });
  const versions = (job?.versions as Array<{ filePath: string }> | undefined) || [];
  const latest = versions.at(-1);
  if (!job || !latest) return fail("NOT_FOUND", "还没有可下载的图片。", null, 404);
  const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
  const absolute = path.resolve(root, latest.filePath);
  if (!absolute.startsWith(root)) return fail("NOT_FOUND", "文件不存在。", null, 404);
  const bytes = await fs.readFile(absolute);
  const inline = request.nextUrl.searchParams.get("preview") === "1";
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="compose-${job.width}x${job.height}.png"`,
    },
  });
}
