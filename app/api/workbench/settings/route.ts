import { NextRequest } from "next/server";
import { getWorkbenchSettings, saveWorkbenchSettings } from "@/lib/workbench/settings";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return ok(await getWorkbenchSettings()); }
  catch (error) { return handleRouteError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { textModelId?: string; imageModelId?: string };
    return ok(await saveWorkbenchSettings({ textModelId: body.textModelId || "", imageModelId: body.imageModelId || "" }));
  } catch (error) { return handleRouteError(error); }
}
