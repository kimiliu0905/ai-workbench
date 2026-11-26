import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { planImageSize, readImageSize } from "@/lib/image/size-policy";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { addLibraryAsset, copyLibraryAsset, readLibraryBytes } from "@/lib/workbench/library";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import type { LibrarySource } from "@/lib/product";

function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
}

type Slot = "frame" | "product" | "reference";
const slotColumn = { frame: "frameCopyPath", product: "productCopyPath", reference: "referenceCopyPath" } as const;

async function writeCopy(buffer: Buffer, jobId: string, slot: string) {
  const relative = path.join("task-copies", "compose", jobId, `${slot}.png`);
  const absolute = path.join(storageRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return relative.replaceAll("\\", "/");
}

export async function createComposeJob(input: { width: number; height: number; instruction?: string; referenceUse?: string; referenceNote?: string }) {
  const settings = await getWorkbenchSettings();
  const plan = planImageSize(input.width, input.height, settings.imageModelId);
  return prisma.composeJob.create({
    data: {
      instruction: input.instruction || "",
      referenceUse: input.referenceUse || "frame",
      referenceNote: input.referenceNote || "",
      width: input.width,
      height: input.height,
      requestWidth: plan.requestWidth,
      requestHeight: plan.requestHeight,
      sizeNote: plan.note,
      modelId: settings.imageModelId,
    },
  });
}

export async function attachComposeInput(jobId: string, slot: Slot, file: { buffer: Buffer; mimeType: string; fileName?: string }, libraryId?: string) {
  const job = await prisma.composeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("做图任务不存在。");
  let buffer = file.buffer;
  let mimeType = file.mimeType;
  let fileName = file.fileName;
  if (libraryId) {
    const copied = await copyLibraryAsset(libraryId, `compose-${jobId}`);
    buffer = await readLibraryBytes(copied.copyPath);
    mimeType = copied.asset.mimeType;
    fileName = copied.asset.name;
    const copyPath = copied.copyPath;
    return prisma.composeJob.update({ where: { id: jobId }, data: { [slotColumn[slot]]: copyPath } });
  }
  const saved = await addLibraryAsset({ name: fileName, source: "compose", buffer, mimeType });
  const copyPath = await writeCopy(buffer, jobId, slot);
  return { job: await prisma.composeJob.update({ where: { id: jobId }, data: { [slotColumn[slot]]: copyPath } }), libraryId: saved.id };
}

export function composePrompt(job: { instruction: string; referenceUse: string; referenceNote: string; width: number; height: number }) {
  const use = job.referenceUse === "look" ? "参考图用于参考画面效果，不要只把它当成风格形容词。" : job.referenceUse === "custom" ? `参考图用途：${job.referenceNote || "按用户说明处理。"}` : "把产品放进主图框或模板中，保留商品外观。";
  return [`输出一张 ${job.width}×${job.height} 的商品图。`, use, job.instruction || "按槽位图片组合出一张可上架的商品图。", "不要拉伸变形。"].filter(Boolean).join("\n");
}

export async function generateComposeJob(jobId: string, instruction?: string) {
  const job = await prisma.composeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("做图任务不存在。");
  const settings = await getWorkbenchSettings();
  const plan = planImageSize(job.width, job.height, settings.imageModelId);
  const slots = [job.frameCopyPath, job.productCopyPath, job.referenceCopyPath].filter((value): value is string => Boolean(value));
  if (!slots.length && !(instruction || job.instruction).trim()) throw new Error("至少要有一张图或一段文字。");
  const references = await Promise.all(slots.map(async relative => `data:image/png;base64,${(await readLibraryBytes(relative)).toString("base64")}`));
  const prompt = composePrompt({ ...job, instruction: instruction ?? job.instruction });
  const { adapter } = await getProviderAdapter();
  const source = await adapter.generateImageOnce({
    model: settings.imageModelId,
    prompt,
    referenceImages: references,
    size: `${plan.requestWidth}x${plan.requestHeight}`,
    timeoutMs: 180000,
  });
  const bytes = source.b64Json ? Buffer.from(source.b64Json, "base64") : Buffer.alloc(0);
  if (!bytes.length) throw new Error("生图没有返回图片。");
  const { finishImageToTarget } = await import("@/lib/image/size-policy");
  const finished = await finishImageToTarget(bytes, { width: job.width, height: job.height });
  const actual = await readImageSize(finished);
  if (actual.width !== job.width || actual.height !== job.height) throw new Error("下载尺寸与目标不一致。");
  const relative = path.join("compose", jobId, `${randomUUID()}.png`).replaceAll("\\", "/");
  const absolute = path.join(storageRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, finished);
  const versions = Array.isArray(job.versions) ? [...(job.versions as Array<Record<string, unknown>>)] : [];
  versions.push({ id: randomUUID(), filePath: relative, note: instruction || job.instruction, createdAt: new Date().toISOString(), width: actual.width, height: actual.height });
  return prisma.composeJob.update({
    where: { id: jobId },
    data: { status: "SUCCESS", instruction: instruction ?? job.instruction, modelId: settings.imageModelId, requestWidth: plan.requestWidth, requestHeight: plan.requestHeight, sizeNote: plan.note, versions: JSON.parse(JSON.stringify(versions)), error: null },
  });
}

export async function saveComposeResult(jobId: string, versionId?: string) {
  const job = await prisma.composeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("做图任务不存在。");
  const versions = (job.versions as Array<{ id: string; filePath: string }>) || [];
  const version = versions.find(item => item.id === versionId) || versions.at(-1);
  if (!version) throw new Error("还没有可保存的结果。");
  const buffer = await readLibraryBytes(version.filePath);
  return addLibraryAsset({ name: job.title, source: "compose" satisfies LibrarySource, buffer, mimeType: "image/png" });
}

export async function listComposeTemplates() {
  return prisma.composeTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function saveComposeTemplate(input: { name: string; frameNote?: string; productNote?: string; referenceNote?: string; referenceUse?: string; instruction?: string; width: number; height: number }) {
  return prisma.composeTemplate.create({ data: { ...input, name: input.name.trim() || "未命名模板" } });
}
