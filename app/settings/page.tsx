"use client";

import { useEffect, useState } from "react";
import { imageModelOptions, textModelOptions } from "@/lib/product";

async function read(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload.data;
}

export default function SettingsPage() {
  const [textModelId, setTextModelId] = useState(textModelOptions[0]);
  const [imageModelId, setImageModelId] = useState(imageModelOptions[0]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/workbench/settings").then(read).then(data => { setTextModelId(data.textModelId); setImageModelId(data.imageModelId); }).catch(reason => setMessage(reason.message));
    fetch("/api/agent/settings").then(response => response.json()).then(payload => setDesktopEnabled(Boolean(payload.data?.settings?.desktopEnabled))).catch(() => undefined);
  }, []);
  async function save() {
    setMessage("");
    await read(await fetch("/api/workbench/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textModelId, imageModelId }) }));
    const agent = await fetch("/api/agent/settings").then(response => response.json());
    if (agent.data?.settings) {
      await fetch("/api/agent/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...agent.data.settings, desktopEnabled, sandboxEnabled: false }) });
    }
    if (nextPassword) {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, nextPassword }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "口令没有改成");
    }
    setMessage("已保存。对新的聊天、做图、译图和 Agent 任务生效。");
    setNextPassword("");
    setCurrentPassword("");
  }
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">设置</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">预配默认模型和口令</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">改完默认模型和口令后，对新的聊天、做图、译图和 Agent 任务生效。</p>
        </div>
        <button type="button" onClick={() => save().catch(reason => setMessage(reason.message))} className="rounded-xl bg-foreground px-4 py-2 text-sm text-white">保存设置</button>
      </div>
      <section className="mt-5 space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">默认模型</h2>
        <p className="text-sm text-muted-foreground">日常做图和聊天不用每次再选模型。</p>
        <label className="block text-sm">默认文本 / 聊天模型
          <select aria-label="默认文本模型" value={textModelId} onChange={event => setTextModelId(event.target.value as typeof textModelId)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3">
            {textModelOptions.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">默认是 gpt-6-luna。可能需要改成其他型号。</p>
        <label className="block text-sm">默认生图模型
          <select aria-label="默认生图模型" value={imageModelId} onChange={event => setImageModelId(event.target.value as typeof imageModelId)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3">
            {imageModelOptions.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">精细编辑不够时，可改为 gpt-image-2.6-sunburst。</p>
      </section>
      <section className="mt-4 space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">共享口令</h2>
        <p className="text-sm text-muted-foreground">用于进入这台电脑上的工作台。不做第三方账号登录。</p>
        <label className="block text-sm">当前共享口令<input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
        <label className="block text-sm">输入新的共享口令<input type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} placeholder="留空则不修改" className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
      </section>
      <section className="mt-4 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Agent 相关开关</h2>
        <p className="mt-2 text-sm text-muted-foreground">桌面控制默认是关闭的，一般不用打开。沙箱和 MCP 也不默认开启。</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={desktopEnabled} onChange={event => setDesktopEnabled(event.target.checked)} />开启桌面控制</label>
      </section>
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </div>
  );
}
