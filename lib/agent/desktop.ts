import { randomUUID } from "node:crypto";
import { AgentHalt } from "./contracts";

type Reply = { channel: string; id: string; result?: unknown; error?: string };
const state = globalThis as typeof globalThis & { agentIpcListening?: boolean; agentIpcPending?: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }> };
const pending = state.agentIpcPending ??= new Map();

// Next's dev process also has process.send. Only Electron sets this after it attaches the broker.
export function desktopBridgeAvailable(env: Record<string, string | undefined> = process.env, ipc: unknown = process.send) {
  return env.APP_RUNTIME === "desktop" && env.WORKBENCH_DESKTOP_BROKER === "1" && typeof ipc === "function";
}

if (desktopBridgeAvailable() && !state.agentIpcListening) { state.agentIpcListening = true; process.on("message", (message: unknown) => {
  const reply = message as Reply;
  if (reply?.channel === "mxpage-agent-stop") {
    void import("./store").then(({ stopDesktopRuns }) => stopDesktopRuns((message as any).runIds)).catch(() => undefined);
    return;
  }
  if (reply?.channel !== "mxpage-agent") return;
  const waiter = pending.get(reply.id);
  if (waiter) { pending.delete(reply.id); reply.error ? waiter.reject(new AgentHalt("PAUSED", reply.error)) : waiter.resolve(reply.result); }
}); }
export async function desktopRequest(action: string, data: unknown = {}): Promise<any> {
  if (!desktopBridgeAvailable()) throw new Error("Agent: 电脑控制仅在 Electron 桌面版可用。");
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new AgentHalt("UNCERTAIN", "桌面通道超时，操作结果不确定。请重新观察后处理。")); }, 45000);
    pending.set(id, { resolve: (value: any) => { clearTimeout(timer); resolve(value); }, reject: (error: Error) => { clearTimeout(timer); reject(error); } });
    process.send!({ channel: "mxpage-agent", id, action, data });
  });
}
