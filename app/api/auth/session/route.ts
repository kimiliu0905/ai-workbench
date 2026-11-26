import { NextResponse } from "next/server";
import { sessionStatus } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, data: await sessionStatus() });
}
