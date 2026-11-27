import OpenAI from "openai";
import { readServerApiKey } from "@/lib/auth/secrets";
import { DEFAULT_LOCK_BASE_URL } from "@/lib/product";

export class WorkbenchError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export function workbenchOpenAI(timeout: number, apiKey = readServerApiKey()) {
  if (!apiKey) throw new WorkbenchError("请先在设置中填入 OpenAI API Key。");
  const fixture = process.env.WORKBENCH_TEST_API_URL;
  const baseURL = fixture && /^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(fixture) ? fixture : DEFAULT_LOCK_BASE_URL;
  return new OpenAI({ apiKey, baseURL, timeout, maxRetries: 0 });
}

export function openAIProblem(error: unknown) {
  if (error instanceof WorkbenchError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new WorkbenchError("OpenAI 响应超时。请检查网络或稍后再试，刚才的请求可能已经开始处理。", 504);
  }
  if (error instanceof OpenAI.APIConnectionError) return new WorkbenchError("连不上 OpenAI，请检查网络连接后再试。", 502);
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return new WorkbenchError("OpenAI 拒绝了这个 Key。请到设置中换一个有效的 Key。", 401);
    if (error.status === 403 || error.status === 404) return new WorkbenchError("这个 OpenAI 项目没有访问当前模型的权限。请检查项目权限或到设置中切换模型。", 403);
    if (error.code === "insufficient_quota") return new WorkbenchError("OpenAI API 额度不足，请检查 API 项目的余额。", 429);
    if (error.status === 429) return new WorkbenchError("请求太频繁，请稍后再试。", 429);
    if (error.status === 400) return new WorkbenchError("OpenAI 未接受本次请求。请检查输入图片、文字要求和所选模型后再试。");
  }
  return new WorkbenchError("操作未完成，请稍后再试。已有历史和结果仍可查看。", 500);
}
