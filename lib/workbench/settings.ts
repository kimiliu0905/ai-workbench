import { prisma } from "@/lib/db/prisma";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, imageModelOptions, textModelOptions } from "@/lib/product";

export async function getSavedWorkbenchModels() {
  const row = await prisma.workbenchSettings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return { textModelId: row.textModelId, imageModelId: row.imageModelId };
}

export async function getWorkbenchSettings() {
  const saved = await getSavedWorkbenchModels();
  return {
    textModelId: saved?.textModelId || DEFAULT_TEXT_MODEL,
    imageModelId: saved?.imageModelId || DEFAULT_IMAGE_MODEL,
    textModelOptions: [...textModelOptions],
    imageModelOptions: [...imageModelOptions],
  };
}

export async function saveWorkbenchSettings(input: { textModelId: string; imageModelId: string }) {
  if (!(textModelOptions as readonly string[]).includes(input.textModelId)) throw new Error("不支持的文本模型。");
  if (!(imageModelOptions as readonly string[]).includes(input.imageModelId)) throw new Error("不支持的生图模型。");
  return prisma.workbenchSettings.upsert({
    where: { id: "default" },
    create: { id: "default", textModelId: input.textModelId, imageModelId: input.imageModelId },
    update: { textModelId: input.textModelId, imageModelId: input.imageModelId },
  });
}

export async function ensureDesktopDefaults() {
  if (process.env.APP_RUNTIME !== "desktop") return;
  await prisma.workbenchSettings.upsert({
    where: { id: "default" },
    create: { id: "default", textModelId: DEFAULT_TEXT_MODEL, imageModelId: DEFAULT_IMAGE_MODEL },
    update: {},
  });
  const existing = await prisma.providerConfig.findFirst({ where: { isActive: true } });
  if (existing) return;
  const baseUrl = process.env.LOCK_BASE_URL?.trim() || "https://api.openai.com/v1";
  await prisma.providerConfig.create({
    data: {
      name: "本机模型服务",
      baseUrl,
      apiKeyEncrypted: "",
      isActive: true,
      models: {
        create: [
          ...textModelOptions.map(modelId => ({
            modelId,
            label: modelId,
            capabilities: { text: true, vision: true, structured_output: true },
            roles: {},
            isDefaultAnalysis: modelId === DEFAULT_TEXT_MODEL,
            isDefaultPlanning: modelId === DEFAULT_TEXT_MODEL,
          })),
          ...imageModelOptions.map(modelId => ({
            modelId,
            label: modelId,
            capabilities: { image_gen: true, image_edit: true, real_image_edit: true },
            roles: {},
            isDefaultHeroImage: modelId === DEFAULT_IMAGE_MODEL,
            isDefaultDetailImage: modelId === DEFAULT_IMAGE_MODEL,
            isDefaultImageEdit: modelId === DEFAULT_IMAGE_MODEL,
          })),
        ],
      },
    },
  });
}
