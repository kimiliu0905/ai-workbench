import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { toFile } from "openai";
import { planImageSize } from "@/lib/image/size-policy";
import { DEFAULT_IMAGE_MODEL } from "@/lib/product";
import { prisma } from "@/lib/db/prisma";
import { addLibraryAsset, copyLibraryAsset } from "@/lib/workbench/library";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import { normalizeUpload, readWorkbenchImage, workbenchFilePath } from "./image-files";
import { openAIProblem, WorkbenchError, workbenchOpenAI } from "./openai";

export const composeSlots = ["frame", "product", "reference"] as const;
export type ComposeSlot = typeof composeSlots[number];
export const slotColumn = { frame: "frameCopyPath", product: "productCopyPath", reference: "referenceCopyPath" } as const;

export type ComposeDraft = { width: number; height: number; instruction: string; referenceUse: string; referenceNote: string };
export type ComposeVersion = { id: string; filePath: string; note: string; width: number; height: number; createdAt: string; baseVersionId?: string };

const activeJobs = new Set<string>();

export function assertComposeIdle(jobId: string) {
  if (activeJobs.has(jobId)) throw new WorkbenchError("这个任务正在生成，请等当前结果出来。", 409);
}

export async function requireComposeJob(id: string) {
  const job = await prisma.composeJob.findUnique({ where: { id } });
  if (!job) throw new WorkbenchError("找不到这项做图任务。", 404);
  return job;
}

export function selectComposeVersion(versions: unknown, id?: string | null) {
  const list = Array.isArray(versions) ? versions as ComposeVersion[] : [];
  const version = id ? list.find(item => item.id === id) : list.at(-1);
  if (!version) throw new WorkbenchError("找不到所选版本，请刷新任务。", 404);
  return version;
}

function prepareDraft(draft: ComposeDraft, modelId: string = DEFAULT_IMAGE_MODEL) {
  const { width, height, instruction, referenceUse, referenceNote } = draft;
  if (![width, height].every(value => Number.isInteger(value) && value >= 16 && value <= 3840) || width * height > 8_294_400) {
    throw new WorkbenchError("宽和高需为 16 到 3840 的整数，总像素不能超过 829 万。");
  }
  if (!["frame", "look", "layout", "custom"].includes(referenceUse)) throw new WorkbenchError("请选择参考图用途。");
  if (instruction.length > 10000 || referenceNote.length > 1000) throw new WorkbenchError("制作要求或参考图说明过长。");

  const { requestWidth, requestHeight } = planImageSize(width, height, modelId);
  return {
    width, height, instruction: instruction.trim(), referenceUse, referenceNote: referenceNote.trim(), requestWidth, requestHeight,
    sizeNote: requestWidth * height === requestHeight * width ? "" : "将等比缩放，比例不同时保留透明边缘。",
  };
}

export async function createComposeJob(draft: ComposeDraft) {
  const { imageModelId } = await getWorkbenchSettings();
  const prepared = prepareDraft(draft, imageModelId);
  return prisma.composeJob.create({ data: { ...prepared, modelId: imageModelId, title: prepared.instruction.slice(0, 26) || "做一张图" } });
}

export async function saveComposeDraft(jobId: string, draft: ComposeDraft) {
  assertComposeIdle(jobId);
  const data = prepareDraft(draft);
  return prisma.composeJob.update({ where: { id: jobId }, data: { ...data, title: data.instruction.slice(0, 26) || "做一张图" } });
}

async function writeImage(relative: string, image: Buffer) {
  const target = workbenchFilePath(relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, image);
  return relative;
}

export async function attachComposeInput(jobId: string, slot: ComposeSlot, file?: File, libraryId?: string) {
  assertComposeIdle(jobId);
  await requireComposeJob(jobId);
  let copyPath: string | null = null;
  if (libraryId) {
    const copy = await copyLibraryAsset(libraryId, `compose-${jobId}`);
    copyPath = copy.copyPath;
  } else if (file) {
    if (file.size > 20 * 1024 * 1024) throw new WorkbenchError("单张图片最大为 20 MB。");
    const buffer = Buffer.from(await file.arrayBuffer());
    const png = await normalizeUpload(buffer, 1536);
    copyPath = await writeImage(`task-copies/compose/${jobId}/${slot}-${randomUUID()}.png`, png);
    const original = await sharp(buffer).metadata();
    await addLibraryAsset({ name: file.name, source: "compose", buffer, mimeType: `image/${original.format}` });
  }
  assertComposeIdle(jobId);
  return prisma.composeJob.update({ where: { id: jobId }, data: { [slotColumn[slot]]: copyPath } });
}

const referenceRoles: Record<string, string> = {
  frame: "从这张参考图中提取用户指定的内容，按要求放入主图框。",
  look: "参考这张图的光线、色彩或视觉风格，保留产品图中的商品身份。",
  layout: "参考这张图的构图和摆放方式，保留产品图中的商品身份。",
  custom: "按下方参考图说明使用。",
};

export async function generateComposeJob(jobId: string, draft: ComposeDraft, versionId?: string, revision?: string) {
  assertComposeIdle(jobId);
  activeJobs.add(jobId);
  let outputPath: string | undefined;
  let prepared = false;
  try {
    const job = await requireComposeJob(jobId);
    const { imageModelId } = await getWorkbenchSettings();
    const data = prepareDraft(draft, imageModelId);
    const change = revision?.trim();
    if (change && change.length > 10000) throw new WorkbenchError("修改说明过长。");
    if (change && !versionId) throw new WorkbenchError("请先选择要修改的版本。");
    const base = change ? selectComposeVersion(job.versions, versionId) : undefined;
    if (!base && job.referenceCopyPath && data.referenceUse === "custom" && !data.referenceNote && !data.instruction) {
      throw new WorkbenchError("请说明要怎样使用参考图。");
    }
    const images = base ? [
      { file: base.filePath, role: "选中的上一版原图。沿用这张图的版式、背景、商品和文字，只修改本次明确指定的部分。" },
    ] : [
      [job.frameCopyPath, "主图框。保持边框、标志、现有文字与留白位置，商品放入指定区域。"],
      [job.productCopyPath, "产品图。保持产品形状、比例、包装文字与颜色。"],
      [job.referenceCopyPath, `参考图。${referenceRoles[data.referenceUse]} ${data.referenceNote}`],
    ].flatMap(([file, role]) => file ? [{ file, role }] : []);
    if (!images.length && !data.instruction) throw new WorkbenchError("请添加一张图片或填写制作要求。");
    const prompt = [
      `制作一张商品图，交付尺寸为 ${data.width}×${data.height}。商品和主框细节应完整可见，不要拉伸或裁掉主体。`,
      ...images.map(({ role }, index) => `第 ${index + 1} 张输入图：${role}`),
      !base && data.instruction && `制作要求：${data.instruction}`,
      change && `本次修改（优先执行）：${change}`,
    ].filter(Boolean).join("\n");
    const callSettings = { model: imageModelId, size: `${data.requestWidth}x${data.requestHeight}`, quality: "medium" as const, output_format: "png" as const, n: 1 };
    const client = workbenchOpenAI(process.env.WORKBENCH_TEST_API_URL ? 4000 : 180000);
    const inputFiles = await Promise.all(images.map(async ({ file }, index) => {
      try {
        const { bytes, type } = await readWorkbenchImage(file);
        return await toFile(bytes, `image-${index + 1}.${type === "jpeg" ? "jpg" : type}`, { type: `image/${type}` });
      } catch { throw new WorkbenchError("有一张素材或历史图片无法读取，请重新上传素材或更换版本。"); }
    }));

    await prisma.composeJob.update({ where: { id: jobId }, data: {
      ...data, title: data.instruction.slice(0, 26) || job.title, modelId: imageModelId, status: "DRAFT", error: null,
    } });
    prepared = true;
    const result = inputFiles.length
      ? await client.images.edit({ ...callSettings, image: inputFiles, prompt })
      : await client.images.generate({ ...callSettings, prompt });
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded) throw new WorkbenchError("OpenAI 没有返回图片。请调整要求后再试。", 502);
    const { data: image, info } = await sharp(Buffer.from(encoded, "base64"))
      .rotate().resize(data.width, data.height, { fit: "contain", background: "#00000000" }).png().toBuffer({ resolveWithObject: true });
    if (info.width !== data.width || info.height !== data.height) throw new WorkbenchError("生成图片尺寸有误，请稍后再试。", 500);
    const id = randomUUID();
    outputPath = await writeImage(`compose/${jobId}/${id}.png`, image);
    const version: ComposeVersion = {
      id, filePath: outputPath, note: change || data.instruction, createdAt: new Date().toISOString(),
      width: info.width, height: info.height, ...(base && { baseVersionId: base.id }),
    };
    const versions = Array.isArray(job.versions) ? [...job.versions, version] : [version];
    return await prisma.composeJob.update({ where: { id: jobId }, data: { status: "SUCCESS", versions } });
  } catch (error) {
    const problem = openAIProblem(error);
    if (outputPath) await fs.unlink(workbenchFilePath(outputPath)).catch(() => {});
    if (prepared) await prisma.composeJob.update({ where: { id: jobId }, data: { status: "FAILED", error: problem.message } }).catch(() => {});
    throw problem;
  } finally {
    activeJobs.delete(jobId);
  }
}

export async function applyComposeTemplate(jobId: string, templateId: string) {
  assertComposeIdle(jobId);
  const template = await prisma.composeTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new WorkbenchError("这个模板不存在。", 404);
  const data = prepareDraft(template);
  return prisma.composeJob.update({
    where: { id: jobId },
    data: { ...data, title: data.instruction.slice(0, 26) || template.name, ...(template.frameCopyPath && { frameCopyPath: template.frameCopyPath }) },
  });
}

export async function saveComposeResult(jobId: string, versionId?: string) {
  const job = await requireComposeJob(jobId);
  const version = selectComposeVersion(job.versions, versionId);
  const { bytes } = await readWorkbenchImage(version.filePath);
  return addLibraryAsset({ name: job.title, source: "compose", buffer: bytes, mimeType: "image/png" });
}

export async function saveComposeTemplate(jobId: string, name: string, draft: ComposeDraft) {
  const job = await requireComposeJob(jobId);
  const { width, height, instruction, referenceUse, referenceNote } = prepareDraft(draft);
  const title = name.trim();
  if (!title || title.length > 80) throw new WorkbenchError("模板名称应为 1 到 80 个字符。");
  return prisma.composeTemplate.create({
    data: { name: title, frameCopyPath: job.frameCopyPath, width, height, instruction, referenceUse, referenceNote },
  });
}
