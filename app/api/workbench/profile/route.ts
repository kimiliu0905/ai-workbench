import { NextRequest } from "next/server";
import { getWorkbenchProfile, saveWorkbenchProfile } from "@/lib/workbench/profile";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return ok(await getWorkbenchProfile()); }
  catch (error) { return handleRouteError(error); }
}

export async function PUT(request: NextRequest) {
  try { return ok(await saveWorkbenchProfile(await request.json())); }
  catch (error) { return handleRouteError(error); }
}
