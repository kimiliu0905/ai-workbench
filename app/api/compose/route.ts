import { NextRequest } from "next/server";
import { applyComposeTemplate, attachComposeInput, composeSlots, createComposeJob, generateComposeJob, requireComposeJob, saveComposeDraft, saveComposeResult, saveComposeTemplate, slotColumn, type ComposeDraft, type ComposeSlot } from "@/lib/workbench/compose";
import { serveWorkbenchImage } from "@/lib/workbench/image-files";
import { openAIProblem, WorkbenchError } from "@/lib/workbench/openai";
import { fail, ok } from "@/lib/utils/route";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function problemResponse(error: unknown) {
  const problem = openAIProblem(error);
  return fail("COMPOSE_ERROR", problem.message, null, problem.status);
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const slot = request.nextUrl.searchParams.get("slot") as ComposeSlot | null;
    if (id) {
      const job = await requireComposeJob(id);
      if (slot && composeSlots.includes(slot)) return serveWorkbenchImage(job[slotColumn[slot]]);
      return ok(job);
    }
    const [jobs, templates] = await Promise.all([
      prisma.composeJob.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, width: true, height: true } }),
      prisma.composeTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
    ]);
    return ok({ jobs, templates });
  } catch (error) { return problemResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ComposeDraft;
    return ok({ job: await createComposeJob(body) }, { status: 201 });
  } catch (error) { return problemResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const form = await request.formData();
    const jobId = String(form.get("jobId") || "");
    const slot = String(form.get("slot") || "") as ComposeSlot;
    if (!composeSlots.includes(slot)) throw new WorkbenchError("请选择正确的素材位置。");
    const file = form.get("file");
    const libraryId = String(form.get("libraryId") || "");
    if (!libraryId && !(file instanceof File) && form.get("remove") !== "1") throw new WorkbenchError("请选择图片。");
    return ok(await attachComposeInput(jobId, slot, file instanceof File ? file : undefined, libraryId || undefined));
  } catch (error) { return problemResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      jobId: string; action: "draft" | "generate" | "apply-template" | "save-template" | "save-result";
      draft: ComposeDraft; versionId?: string; revision?: string; templateId?: string; name?: string;
    };
    if (!body.jobId) throw new WorkbenchError("找不到做图任务。");
    switch (body.action) {
      case "draft": return ok(await saveComposeDraft(body.jobId, body.draft));
      case "generate": return ok(await generateComposeJob(body.jobId, body.draft, body.versionId, body.revision));
      case "apply-template": return ok(await applyComposeTemplate(body.jobId, body.templateId || ""));
      case "save-template": return ok(await saveComposeTemplate(body.jobId, body.name || "", body.draft));
      case "save-result": return ok(await saveComposeResult(body.jobId, body.versionId));
      default: throw new WorkbenchError("请选择要执行的操作。");
    }
  } catch (error) { return problemResponse(error); }
}
