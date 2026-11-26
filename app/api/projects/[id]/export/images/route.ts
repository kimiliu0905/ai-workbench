import { buildImageArchive } from "@/lib/services/export-service";
import { handleRouteError } from "@/lib/utils/route";

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const sections = new URL(request.url).searchParams.get("sections")?.split(",").map(id => id.trim()).filter(Boolean);
    const stream = await buildImageArchive(context.params.id, sections);
    return new Response(stream as never, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${context.params.id}-detail-page-images.zip"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
