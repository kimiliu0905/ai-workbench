export async function readWorkbench<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || "操作没有完成，请刷新后再试。");
  return body.data as T;
}

export function sendJson(method: string, body: object) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
