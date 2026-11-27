"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useImagePreview } from "@/components/shared/image-preview-provider";
import { WorkbenchSetup } from "@/components/layout/workbench-setup";
import { readWorkbench, sendJson } from "@/lib/workbench/client";

type Message = { id: string; role: string; content: string; imagePath?: string };
type Session = { id: string; title: string; updatedAt: string; messages?: Message[] };
type ChatEvent = { saved?: Message; delta?: string; done?: Message; error?: string };

const prompts = [
  ["润色文案", "帮我润色下面这段文字，保留原意："],
  ["翻译文字", "帮我把下面这段文字翻译成泰语，语气自然："],
  ["看图提问", ""],
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState("");
  const [manage, setManage] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState("");
  const locked = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const { openImagePreview } = useImagePreview();

  function loadSessions() {
    return fetch("/api/chat").then(readWorkbench<Session[]>);
  }
  function loadSession(id: string) {
    return fetch(`/api/chat/${id}`).then(readWorkbench<Session>);
  }
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("session");
    loadSessions().then(async list => {
      const selected = list.find(item => item.id === id) || list[0];
      const session = selected ? await loadSession(selected.id) : null;
      if (active) {
        setSessions(list);
        setCurrent(session);
        setReady(true);
      }
    }).catch(reason => {
      if (active) { setError(reason.message); setReady(true); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView({ block: "end" });
  }, [current?.messages, live, busy]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (reason) { setError((reason as Error).message); }
    finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function select(session: Session | null) {
    setError("");
    setCurrent(session);
    setText("");
    setFile(null);
    setLive("");
    setManage(null);
    following.current = true;
    window.history.replaceState(null, "", session ? `/chat?session=${session.id}` : "/chat");
    composer.current?.focus();
  }

  async function send() {
    if ((!text.trim() && !file) || !ready) return;
    following.current = true;
    await run(async () => {
      const session = current ?? await readWorkbench<Session>(await fetch("/api/chat", sendJson("POST", {})));
      let pending = "";
      let finished = false;
      if (!current) {
        setCurrent(session);
        setSessions(list => [session, ...list]);
        window.history.replaceState(null, "", `/chat?session=${session.id}`);
      }
      const form = new FormData();
      if (file) {
        form.set("sessionId", session.id);
        form.set("content", text);
        form.set("file", file);
      }
      const response = await fetch("/api/chat", file ? { method: "PUT", body: form } : sendJson("POST", { sessionId: session.id, content: text }));
      if (!response.ok) await readWorkbench(response);
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) throw new Error("回复连接中断，请刷新对话。");
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += chunk.value;
          const lines = pending.split("\n");
          pending = lines.pop() || "";
          for (const line of lines) {
            if (!line) continue;
            const event = JSON.parse(line) as ChatEvent;
            if (event.saved) {
              const saved = event.saved;
              setCurrent(previous => previous ? { ...previous, messages: [...previous.messages || [], saved] } : previous);
              setText("");
              setFile(null);
            }
            if (event.delta) setLive(value => value + event.delta);
            if (event.done) {
              const done = event.done;
              setCurrent(previous => previous ? { ...previous, messages: [...previous.messages || [], done] } : previous);
              finished = true;
              setLive("");
            }
            if (event.error) throw new Error(event.error);
          }
        }
        if (!finished) throw new Error("回复连接中断，已收到的文字仍可查看。");
      } finally {
        await reader.cancel().catch(() => {});
        void loadSessions().then(setSessions).catch(() => {});
        if (finished) void loadSession(session.id).then(saved => setCurrent(previous => previous?.id === saved.id ? { ...previous, title: saved.title } : previous)).catch(() => {});
      }
    });
  }

  async function manageSession() {
    if (!current || !manage) return;
    await run(async () => {
      const url = `/api/chat/${current.id}`;
      if (manage === "delete") {
        await readWorkbench(await fetch(url, { method: "DELETE" }));
        select(null);
      } else {
        const updated = await readWorkbench<Session>(await fetch(url, sendJson("PATCH", { title })));
        setCurrent({ ...current, title: updated.title });
      }
      setManage(null);
      setSessions(await loadSessions());
    });
  }

  return (
    <div className="wb-chat">
      <aside className="wb-history">
        <div className="wb-history-heading"><h2>对话记录</h2><button type="button" className="wb-icon" aria-label="新建对话" title="新建对话" disabled={busy} onClick={() => select(null)}><Plus size={19} /></button></div>
        <div className="wb-history-list">
          {sessions.map(session => <button key={session.id} type="button" aria-pressed={current?.id === session.id} disabled={busy} onClick={() => void run(async () => select(await loadSession(session.id)))}><MessageSquare size={15} /><span>{session.title}</span></button>)}
          {ready && sessions.length === 0 && <p>发送消息后，对话会保存在这里。</p>}
        </div>
      </aside>
      <section className="wb-chat-room">
        <div className="wb-room-heading">
          <span>{current?.title || "新对话"}</span>
          {current && <div><button type="button" className="wb-icon" title="重命名对话" aria-label="重命名对话" disabled={busy} onClick={() => { setTitle(current.title); setManage("rename"); }}><Pencil size={16} /></button><button type="button" className="wb-icon" title="删除对话" aria-label="删除对话" disabled={busy} onClick={() => setManage("delete")}><Trash2 size={16} /></button></div>}
        </div>
        {manage && <form className="wb-manage" onSubmit={event => { event.preventDefault(); void manageSession(); }}>
          {manage === "rename" ? <input autoFocus aria-label="对话名称" value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /> : <span>删除「{current?.title}」及其聊天记录？</span>}
          <button className="wb-button" type="button" onClick={() => setManage(null)}>取消</button>
          <button className="wb-button wb-primary" type="submit" disabled={busy || (manage === "rename" && !title.trim())}>{manage === "rename" ? "保存名称" : "确认删除"}</button>
        </form>}
        <div className="wb-chat-scroll" ref={feed} onScroll={() => {
          const node = feed.current;
          if (node) following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
        }}>
          <div className="wb-transcript">
            <WorkbenchSetup />
            {ready && !current?.messages?.length && !busy && !live && <div className="wb-chat-empty">
              <div className="wb-mark"><MessageSquare size={29} strokeWidth={1.65} /></div>
              <h1>今天聊点什么？</h1>
              <p>问个问题、写一段文字，或者发张图一起看看。</p>
              <div className="wb-suggestions">{prompts.map(([label, prompt]) => <button key={label} type="button" className="wb-button" onClick={() => { if (prompt) { setText(prompt); composer.current?.focus(); } else { input.current?.click(); } }}>{label}</button>)}</div>
            </div>}
            {current?.messages?.map(message => <article key={message.id} className={message.role === "user" ? "wb-message wb-user" : "wb-message wb-assistant"}>
              {message.imagePath && <button type="button" className="wb-chat-picture" aria-label="查看聊天图片" onClick={() => openImagePreview({ url: `/api/chat/${current.id}?image=${message.id}`, title: "聊天图片" })}><img src={`/api/chat/${current.id}?image=${message.id}`} alt="聊天图片" /></button>}
              {message.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{message.content}</ReactMarkdown> : <span>{message.content}</span>}
            </article>)}
            {live && <article className="wb-message wb-assistant"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{live}</ReactMarkdown></article>}
            {busy && !live && <p role="status" className="wb-chat-loading">正在处理…</p>}
            <div ref={end} />
          </div>
        </div>
        <div className="wb-chat-bottom">
          {error && <p role="alert" className="wb-error">{error}</p>}
          <div className="wb-composer">
            {file && <div className="wb-attachment">{preview && <img src={preview} alt="待发送图片" />}<span>{file.name}</span><button type="button" className="wb-icon" aria-label="移除附图" onClick={() => setFile(null)} disabled={busy}><X size={15} /></button></div>}
            <textarea ref={composer} rows={2} maxLength={20000} aria-label="消息" placeholder="输入消息" value={text} readOnly={busy} onChange={event => setText(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
            }} />
            <div className="wb-composer-tools">
              <input type="file" ref={input} aria-label="聊天附图" accept="image/png,image/jpeg,image/webp" hidden onChange={event => {
                if (event.target.files?.[0]) setFile(event.target.files[0]);
                event.target.value = "";
              }} />
              <button className="wb-button wb-subtle" type="button" onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={18} /> 添加图片</button>
              <button className="wb-button wb-primary wb-send" type="button" aria-label="发送" disabled={busy || !ready || (!text.trim() && !file)} onClick={() => void send()}><ArrowUp size={20} /></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
