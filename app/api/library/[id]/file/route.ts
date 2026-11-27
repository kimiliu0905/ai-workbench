import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { fail } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const asset = await prisma.libraryAsset.findUnique({ where: { id: params.id } });
  if (!asset) return fail("NOT_FOUND", "素材不存在。", null, 404);
  const absolute = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage", asset.filePath);
  const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
  if (!absolute.startsWith(root)) return fail("NOT_FOUND", "素材不存在。", null, 404);
  const bytes = await fs.readFile(absolute);
  return new Response(bytes, { headers: { "Content-Type": asset.mimeType, "Cache-Control": "no-store" } });
}
