import { NextRequest } from "next/server";
import { addLibraryAsset, deleteLibraryAsset, listLibraryAssets, renameLibraryAsset, replaceLibraryAsset } from "@/lib/workbench/library";
import { handleRouteError, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || undefined;
    const source = request.nextUrl.searchParams.get("source") || undefined;
    const assets = await listLibraryAssets({ q, source });
    return ok(assets.map(asset => ({ ...asset, url: `/api/library/${asset.id}/file` })));
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return handleRouteError(new Error("请选择图片。"));
    const source = String(form.get("source") || "upload");
    if (!["compose", "set", "translate", "upload"].includes(source)) throw new Error("不支持的素材来源。");
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await addLibraryAsset({ name: String(form.get("name") || file.name), source: source as "upload", buffer, mimeType: file.type || "image/png" });
    return ok(asset, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string; name?: string };
    if (!body.id || !body.name) throw new Error("请提供素材和名称。");
    return ok(await renameLibraryAsset(body.id, body.name));
  } catch (error) { return handleRouteError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const form = await request.formData();
    const id = String(form.get("id") || "");
    const file = form.get("file");
    if (!id || !(file instanceof File)) throw new Error("请选择要替换的图片。");
    const buffer = Buffer.from(await file.arrayBuffer());
    return ok(await replaceLibraryAsset(id, buffer, file.type || "image/png", String(form.get("name") || "")));
  } catch (error) { return handleRouteError(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id) throw new Error("请指定要删除的素材。");
    await deleteLibraryAsset(id);
    return ok({ id });
  } catch (error) { return handleRouteError(error); }
}
