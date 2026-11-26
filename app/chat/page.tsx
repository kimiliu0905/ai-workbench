"use client";

import { useEffect, useState } from "react";

type Session = { id: string; title: string; updatedAt: string; messages?: { id: string; role: string; content: string }[] };

async function read(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload.data;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setSessions(await read(await fetch("/api/chat")));
  }
  async function open(id: string) {
    setCurrent(await read(await fetch(`/api/chat/${id}`)));
  }
  useEffect(() => { refresh().catch(reason => setError(reason.message)); const id = new URLSearchParams(window.location.search).get("session"); if (id) open(id).catch(reason => setError(reason.message)); }, []);
  async function create() {
    const session = await read(await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    await refresh();
    await open(session.id);
    return session as Session;
  }
  async function send() {
    const session = current || await create();
    const sessionId = session.id;
    if (!sessionId) return;
    setBusy(true);
    setError("");
    try {
      if (file) {
        const form = new FormData();
        form.set("sessionId", sessionId);
        form.set("content", text);
        form.set("file", file);
        setCurrent(await read(await fetch("/api/chat", { method: "PUT", body: form })));
      } else {
        setCurrent(await read(await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, content: text }) })));
      }
      setText("");
      setFile(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发送失败");
    } finally { setBusy(false); }
  }
  return (
    <div className="grid h-full min-h-[640px] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-3">
        <button type="button" onClick={() => create().catch(reason => setError(reason.message))} className="rounded-xl bg-foreground px-4 py-3 text-sm text-white">+ 新建对话</button>
        <div className="space-y-2">{sessions.map(session => <button key={session.id} type="button" onClick={() => open(session.id)} className="w-full rounded-xl border bg-white px-3 py-3 text-left text-sm">{session.title}</button>)}</div>
      </aside>
      <section className="flex min-h-0 flex-col">
        <h1 className="text-2xl font-semibold tracking-tight">直接问就好</h1>
        <div className="mt-4 flex-1 space-y-3 overflow-auto">
          {current?.messages?.map(message => <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-foreground px-4 py-3 text-sm text-white" : "max-w-[80%] rounded-2xl border bg-white px-4 py-3 text-sm"}>{message.content}</article>)}
          {!current?.messages?.length && <p className="text-sm text-muted-foreground">可以问答、改文字、翻译，也可以发图讨论。这里没有模型选择，也没有工具审批。</p>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-3 flex items-end gap-2 rounded-2xl border bg-white p-3">
          <label className="cursor-pointer rounded-lg border px-3 py-2 text-xs">附图<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
          <textarea value={text} onChange={event => setText(event.target.value)} rows={2} placeholder="输入消息，也可发图讨论" className="min-h-12 flex-1 resize-none bg-transparent text-sm outline-none" />
          <button type="button" disabled={busy} onClick={() => void send()} className="rounded-xl bg-foreground px-4 py-2 text-sm text-white">发送</button>
        </div>
        {file && <p className="mt-2 text-xs text-muted-foreground">将发送图片：{file.name}。聊天图片不会自动进入素材库。</p>}
      </section>
    </div>
  );
}
