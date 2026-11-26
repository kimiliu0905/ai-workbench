import { NextRequest } from "next/server";
import { getChatSession } from "@/lib/workbench/chat";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getChatSession(params.id);
    if (!session) return handleRouteError(Object.assign(new Error("对话不存在。"), { status: 404 }));
    return ok(session);
  } catch (error) { return handleRouteError(error); }
}
