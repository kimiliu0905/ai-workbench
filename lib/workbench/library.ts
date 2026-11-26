import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { saveUploadAsset } from "@/lib/storage/asset-manager";
import { readImageSize } from "@/lib/image/size-policy";
import type { LibrarySource } from "@/lib/product";

export type LibraryOrigin = "compose-input" | "set-input" | "translate-input" | "chat" | "generated";

export function librarySavePolicy(origin: LibraryOrigin) {
  return origin === "compose-input" || origin === "set-input" || origin === "translate-input";
}

function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
}

function displayName(fileName?: string | null) {
  const base = path.basename(fileName || "").replace(/\.[^.]+$/, "").trim();
  return base || "未命名";
}

export async function saveLibraryFile(buffer: Buffer, id: string, mimeType: string) {
  const ext = mimeType.includes("webp") ? "webp" : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
  const relative = path.join("library", `${id}.${ext}`);
  const absolute = path.join(storageRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return relative.replaceAll("\\", "/");
}

export async function addLibraryAsset(input: { name?: string | null; source: LibrarySource; buffer: Buffer; mimeType: string }) {
  const size = await readImageSize(input.buffer).catch(() => ({ width: undefined, height: undefined }));
  const created = await prisma.libraryAsset.create({
    data: {
      name: displayName(input.name),
      source: input.source,
      filePath: "pending",
      mimeType: input.mimeType,
      width: size.width,
      height: size.height,
    },
  });
  const filePath = await saveLibraryFile(input.buffer, created.id, input.mimeType);
  return prisma.libraryAsset.update({ where: { id: created.id }, data: { filePath } });
}

export async function listLibraryAssets(query?: { q?: string; source?: string }) {
  return prisma.libraryAsset.findMany({
    where: {
      ...(query?.source && query.source !== "all" ? { source: query.source } : {}),
      ...(query?.q ? { name: { contains: query.q } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function importLibraryAssetToProject(libraryId: string, projectId: string, sortOrder: number) {
  const asset = await prisma.libraryAsset.findUnique({ where: { id: libraryId } });
  if (!asset) throw new Error("素材不存在。");
  const buffer = await readLibraryBytes(asset.filePath);
  const ext = asset.mimeType.includes("webp") ? "webp" : asset.mimeType.includes("jpeg") || asset.mimeType.includes("jpg") ? "jpg" : "png";
  return saveUploadAsset({
    projectId,
    type: "MAIN",
    fileName: `${asset.name}.${ext}`,
    mimeType: asset.mimeType,
    fileBuffer: buffer,
    sortOrder,
    uploadKey: `library:${libraryId}:${sortOrder}`,
  });
}

export async function copyLibraryAsset(id: string, scope: string) {
  const asset = await prisma.libraryAsset.findUnique({ where: { id } });
  if (!asset) throw new Error("素材不存在。");
  const source = path.join(storageRoot(), asset.filePath);
  const relative = path.join("task-copies", scope, `${id}-${Date.now()}${path.extname(asset.filePath) || ".png"}`);
  const absolute = path.join(storageRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.copyFile(source, absolute);
  return { asset, copyPath: relative.replaceAll("\\", "/") };
}

export async function readLibraryBytes(relativePath: string) {
  return fs.readFile(path.join(storageRoot(), relativePath));
}

export async function renameLibraryAsset(id: string, name: string) {
  const next = name.trim();
  if (!next) throw new Error("名称不能为空。");
  return prisma.libraryAsset.update({ where: { id }, data: { name: next } });
}

export async function replaceLibraryAsset(id: string, buffer: Buffer, mimeType: string, name?: string) {
  const current = await prisma.libraryAsset.findUnique({ where: { id } });
  if (!current) throw new Error("素材不存在。");
  const filePath = await saveLibraryFile(buffer, id, mimeType);
  const size = await readImageSize(buffer).catch(() => ({ width: current.width ?? undefined, height: current.height ?? undefined }));
  return prisma.libraryAsset.update({
    where: { id },
    data: { filePath, mimeType, width: size.width, height: size.height, ...(name?.trim() ? { name: name.trim() } : {}) },
  });
}

export async function deleteLibraryAsset(id: string) {
  const current = await prisma.libraryAsset.findUnique({ where: { id } });
  if (!current) return;
  await prisma.libraryAsset.delete({ where: { id } });
  const used = await prisma.composeJob.count({
    where: { OR: [{ frameCopyPath: { contains: id } }, { productCopyPath: { contains: id } }, { referenceCopyPath: { contains: id } }] },
  });
  if (!used) {
    await fs.rm(path.join(storageRoot(), current.filePath), { force: true });
  }
}
