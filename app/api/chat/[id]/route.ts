import { NextRequest } from "next/server";
import { changeChatSession, getChatSession } from "@/lib/workbench/chat";
import { serveWorkbenchImage } from "@/lib/workbench/image-files";
import { openAIProblem } from "@/lib/workbench/openai";
import { fail, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";
type Call = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Call) {
  const session = await getChatSession(params.id);
  if (!session) return fail("NOT_FOUND", "对话不存在。", null, 404);
  const image = request.nextUrl.searchParams.get("image");
  if (image) return serveWorkbenchImage(session.messages.find(message => message.id === image)?.imagePath);
  return ok(session);
}

export async function PATCH(request: NextRequest, { params }: Call) {
  try {
    const { title } = await request.json();
    return ok(await changeChatSession(params.id, String(title || "")));
  } catch (error) {
    const problem = openAIProblem(error);
    return fail("CHAT_ERROR", problem.message, null, problem.status);
  }
}

export async function DELETE(_request: NextRequest, { params }: Call) {
  try {
    await changeChatSession(params.id, null);
    return ok(true);
  } catch (error) {
    const problem = openAIProblem(error);
    return fail("CHAT_ERROR", problem.message, null, problem.status);
  }
}
