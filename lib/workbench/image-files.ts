import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { WorkbenchError } from "./openai";

export function workbenchFilePath(relative: string) {
  const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw new WorkbenchError("找不到图片。", 404);
  return file;
}

export async function normalizeUpload(input: Buffer, maxSide: number) {
  if (input.length > 20 * 1024 * 1024) throw new WorkbenchError("单张图片最大为 20 MB。");
  try {
    const image = sharp(input, { limitInputPixels: 50_000_000 });
    const { format } = await image.metadata();
    if (!format || !["png", "jpeg", "webp"].includes(format)) throw new Error("unsupported");
    return await image.rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new WorkbenchError("无法读取这张图片，请选用 PNG、JPG 或 WebP 文件。");
  }
}

export async function serveWorkbenchImage(relative?: string | null) {
  if (!relative) return new Response(null, { status: 404 });
  try {
    const bytes = await fs.readFile(workbenchFilePath(relative));
    const { format } = await sharp(bytes).metadata();
    const type = format === "jpeg" || format === "webp" ? format : "png";
    return new Response(bytes, { headers: { "Content-Type": `image/${type}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function readWorkbenchImage(relative: string) {
  const bytes = await fs.readFile(workbenchFilePath(relative));
  const { format } = await sharp(bytes).metadata();
  const type = format === "jpeg" || format === "webp" ? format : "png";
  return { bytes, type };
}
