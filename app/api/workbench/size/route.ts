import { NextRequest } from "next/server";
import { planImageSize } from "@/lib/image/size-policy";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { width?: number; height?: number };
    const width = Number(body.width);
    const height = Number(body.height);
    const settings = await getWorkbenchSettings();
    return ok(planImageSize(width, height, settings.imageModelId));
  } catch (error) { return handleRouteError(error); }
}
