"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { readWorkbench, sendJson } from "@/lib/workbench/client";

type Settings = { keyConfigured: boolean; textModelId: string; imageModelId: string; textModelOptions: string[]; imageModelOptions: string[] };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/workbench/settings").then(readWorkbench<Settings>).then(setSettings).catch(reason => setError(reason.message));
  }, []);

  async function save(event: FormEvent, body: object, keyChange: boolean) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const updated = await readWorkbench<Settings>(await fetch("/api/workbench/settings", sendJson("POST", body)));
      setSettings(updated);
      if (keyChange) {
        setKey("");
        setShow(false);
      }
      setMessage(keyChange ? "已验证并保存。现在可以开始聊天和做图。" : "模型设置已保存。");
    } catch (reason) {
      setError((reason as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="wb-settings">
      <Link className="wb-back" href="/chat"><ArrowLeft size={16} /> 返回聊天</Link>
      <h1>设置</h1>
      <section className="wb-setting-section">
        <div className="wb-setting-title"><div className="wb-mark"><KeyRound size={22} /></div><div><h2>连接 OpenAI</h2><p>设置一次，聊天和做图都能使用。</p></div></div>
        {settings && <p className="wb-key-state" data-ready={settings.keyConfigured}>{settings.keyConfigured ? "已配置" : "待配置"}</p>}
        <form onSubmit={event => void save(event, { apiKey: key }, true)}>
          <label htmlFor="wb-api-key">OpenAI API Key</label>
          <div className="wb-setting-input">
            <input id="wb-api-key" type={show ? "text" : "password"} value={key} onChange={event => setKey(event.target.value)} placeholder={settings?.keyConfigured ? "输入新的 Key 可替换" : "粘贴你的 OpenAI API Key"} autoComplete="off" spellCheck={false} />
            <button type="button" className="wb-button wb-subtle" onClick={() => setShow(!show)}>{show ? "隐藏" : "显示"}</button>
          </div>
          <button type="submit" className="wb-button wb-primary" disabled={!key.trim() || busy || !settings} >{busy ? "正在保存…" : "验证并保存"}</button>
        </form>
        <p>保存后可以关闭设置。使用模型会消耗对应 OpenAI 项目的 API 额度。</p>
        {message && <p role="status" className="wb-feedback">{message}</p>}
        {error && <p role="alert" className="wb-error">{error}</p>}
      </section>
      {settings && <details className="wb-setting-section">
        <summary>高级设置</summary>
        <form onSubmit={event => void save(event, { textModelId: settings.textModelId, imageModelId: settings.imageModelId }, false)}>
          <label>聊天模型<select value={settings.textModelId} onChange={event => setSettings({ ...settings, textModelId: event.target.value })}>{settings.textModelOptions.map(model => <option key={model}>{model}</option>)}</select></label>
          <label>做图模型<select value={settings.imageModelId} onChange={event => setSettings({ ...settings, imageModelId: event.target.value })}>{settings.imageModelOptions.map(model => <option key={model}>{model}</option>)}</select></label>
          <button className="wb-button" type="submit" disabled={busy}>保存模型</button>
        </form>
        <div className="wb-setting-links"><Link href="/settings/data">数据管理</Link><Link href="/settings/about">关于</Link></div>
      </details>}
    </div>
  );
}
