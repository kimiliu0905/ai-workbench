import { NextRequest } from "next/server";
import { createChatSession, listChatSessions, sendChatMessage } from "@/lib/workbench/chat";
import { handleRouteError, ok } from "@/lib/utils/route";
import { withProviderCredentials } from "@/lib/services/provider-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return ok(await listChatSessions()); }
  catch (error) { return handleRouteError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { sessionId?: string; content?: string };
    if (!body.sessionId) return ok(await createChatSession(), { status: 201 });
    return withProviderCredentials(request, async () => ok(await sendChatMessage(body.sessionId!, body.content || "")));
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const form = await request.formData();
    const sessionId = String(form.get("sessionId") || "");
    const content = String(form.get("content") || "");
    const file = form.get("file");
    const image = file instanceof File ? { buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "image/png" } : null;
    return await withProviderCredentials(request, async () => ok(await sendChatMessage(sessionId, content, image)));
  } catch (error) { return handleRouteError(error); }
}
