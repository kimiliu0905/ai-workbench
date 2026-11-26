import { NextRequest } from "next/server";
import { attachComposeInput, createComposeJob, generateComposeJob, listComposeTemplates, saveComposeResult, saveComposeTemplate } from "@/lib/workbench/compose";
import { planImageSize } from "@/lib/image/size-policy";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import { withProviderCredentials } from "@/lib/services/provider-runtime";
import { handleRouteError, ok } from "@/lib/utils/route";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await prisma.composeJob.findMany({ orderBy: { updatedAt: "desc" }, take: 20 });
    const templates = await listComposeTemplates();
    const settings = await getWorkbenchSettings();
    return ok({ jobs, templates, modelId: settings.imageModelId });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { width?: number; height?: number; instruction?: string; referenceUse?: string; referenceNote?: string; templateName?: string; saveTemplate?: boolean; frameNote?: string; productNote?: string };
    const width = Number(body.width);
    const height = Number(body.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 3840 || height > 3840) {
      return handleRouteError(new Error("请填写 16 到 3840 之间的宽和高。"));
    }
    const settings = await getWorkbenchSettings();
    const plan = planImageSize(width, height, settings.imageModelId);
    const job = await createComposeJob({ width, height, instruction: body.instruction, referenceUse: body.referenceUse, referenceNote: body.referenceNote });
    if (body.saveTemplate) {
      await saveComposeTemplate({ name: body.templateName || "未命名模板", instruction: body.instruction, referenceUse: body.referenceUse, referenceNote: body.referenceNote, frameNote: body.frameNote, productNote: body.productNote, width, height });
    }
    return ok({ job, plan }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const form = await request.formData();
    const jobId = String(form.get("jobId") || "");
    const slot = String(form.get("slot") || "") as "frame" | "product" | "reference";
    if (!["frame", "product", "reference"].includes(slot)) throw new Error("槽位不正确。");
    const libraryId = String(form.get("libraryId") || "");
    const file = form.get("file");
    if (libraryId) return ok(await attachComposeInput(jobId, slot, { buffer: Buffer.alloc(0), mimeType: "image/png" }, libraryId));
    if (!(file instanceof File)) throw new Error("请选择图片。");
    return ok(await attachComposeInput(jobId, slot, { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "image/png", fileName: file.name }));
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { jobId?: string; instruction?: string; save?: boolean; versionId?: string };
    if (!body.jobId) throw new Error("缺少做图任务。");
    if (body.save) return ok(await saveComposeResult(body.jobId, body.versionId));
    return await withProviderCredentials(request, async () => ok(await generateComposeJob(body.jobId!, body.instruction)));
  } catch (error) { return handleRouteError(error); }
}
