import { NextRequest } from "next/server";
import { createChatSession, listChatSessions, streamChatMessage } from "@/lib/workbench/chat";
import { fail, ok } from "@/lib/utils/route";
import { openAIProblem, WorkbenchError } from "@/lib/workbench/openai";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await listChatSessions());
}

async function send(sessionId: string, content: string, file?: File) {
  if (file && file.size > 20 * 1024 * 1024) throw new WorkbenchError("单张图片最大为 20 MB。");
  const stream = await streamChatMessage(sessionId, content, file && Buffer.from(await file.arrayBuffer()));
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sessionId?: string; content?: string };
    if (!body.sessionId) return ok(await createChatSession(), { status: 201 });
    return await send(body.sessionId, body.content || "");
  } catch (error) {
    const problem = openAIProblem(error);
    return fail("CHAT_ERROR", problem.message, null, problem.status);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    return await send(String(form.get("sessionId") || ""), String(form.get("content") || ""), file instanceof File ? file : undefined);
  } catch (error) {
    const problem = openAIProblem(error);
    return fail("CHAT_ERROR", problem.message, null, problem.status);
  }
}
