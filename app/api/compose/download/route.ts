import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { requireComposeJob, selectComposeVersion } from "@/lib/workbench/compose";
import { workbenchFilePath } from "@/lib/workbench/image-files";
import { fail } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const job = await requireComposeJob(request.nextUrl.searchParams.get("jobId") || "");
    const version = selectComposeVersion(job.versions, request.nextUrl.searchParams.get("versionId"));
    const bytes = await fs.readFile(workbenchFilePath(version.filePath));
    const inline = request.nextUrl.searchParams.get("preview") === "1";
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="compose-${version.width}x${version.height}-${version.id.slice(0, 8)}.png"`,
      },
    });
  } catch {
    return fail("NOT_FOUND", "找不到所选版本的图片。", null, 404);
  }
}
