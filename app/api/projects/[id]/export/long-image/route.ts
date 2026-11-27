import { exportLongImage } from "@/lib/detail-runs/long-image";
import { handleRouteError } from "@/lib/utils/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const sections = new URL(request.url).searchParams.get("sections")?.split(",").map(id => id.trim()).filter(Boolean);
    return new Response(new Uint8Array(await exportLongImage(params.id, sections)), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="detail-${params.id}.png"`, "Cache-Control": "no-store" } });
  }
  catch (error) { return handleRouteError(error); }
}
