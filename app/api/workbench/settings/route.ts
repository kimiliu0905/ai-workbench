import { NextRequest } from "next/server";
import { readServerApiKey, saveServerApiKey } from "@/lib/auth/secrets";
import { getWorkbenchSettings, saveWorkbenchSettings } from "@/lib/workbench/settings";
import { openAIProblem, WorkbenchError, workbenchOpenAI } from "@/lib/workbench/openai";
import { fail, ok } from "@/lib/utils/route";

export const dynamic = "force-dynamic";

async function state() {
  return { ...await getWorkbenchSettings(), keyConfigured: Boolean(readServerApiKey()) };
}

export async function GET() {
  return ok(await state());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { apiKey?: string; textModelId?: string; imageModelId?: string };
    if (body.apiKey !== undefined) {
      const key = body.apiKey.trim();
      if (!/^\S{10,512}$/.test(key)) throw new WorkbenchError("请输入完整的 OpenAI API Key。");
      const { textModelId } = await getWorkbenchSettings();
      await workbenchOpenAI(15000, key).models.retrieve(textModelId);
      saveServerApiKey(key);
    } else {
      await saveWorkbenchSettings({ textModelId: body.textModelId || "", imageModelId: body.imageModelId || "" });
    }
    return ok(await state());
  } catch (error) {
    const problem = openAIProblem(error);
    return fail("SETTINGS_ERROR", problem.message, null, problem.status);
  }
}
