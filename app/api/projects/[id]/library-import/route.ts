import { NextRequest } from "next/server";
import { importLibraryAssetToProject } from "@/lib/workbench/library";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json() as { libraryId?: string; sortOrder?: number };
    if (!body.libraryId) throw new Error("请选择素材。");
    const asset = await importLibraryAssetToProject(body.libraryId, params.id, Number(body.sortOrder) || 0);
    return ok(asset, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}
