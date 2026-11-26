"use client";

import { useEffect, useState } from "react";
import { PromptReviewPanel } from "@/components/editor/prompt-review-panel";
import { platformLabels, platformOptions } from "@/types/domain";
import { sizePresets } from "@/lib/product";

type Run = { id: string; status: string; stage: string; error?: string | null; checkpoint?: { promptReview?: { revision: number; pages: Array<{ sectionId: string; title: string; kind: "HERO" | "DETAIL"; prompt: string }> }; images?: Array<{ sectionId: string; state: string; assetId?: string; title?: string }> } };
type Section = { id: string; title: string; type: string; currentImageAsset?: { filePath: string } | null };

async function read(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload.data;
}

export default function SetPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [facts, setFacts] = useState("");
  const [mode, setMode] = useState<"hero" | "detail" | "both">("both");
  const [heroCount, setHeroCount] = useState(4);
  const [detailCount, setDetailCount] = useState(6);
  const [platform, setPlatform] = useState("general_ecommerce");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [preset, setPreset] = useState("1024x1024");
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editNote, setEditNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/workbench/size", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ width, height }) }).then(read).then(plan => setNote(plan.legal ? "" : plan.note)).catch(() => undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [width, height]);

  useEffect(() => {
    if (!projectId || !run || ["COMPLETED", "PARTIAL", "FAILED", "CANCELED", "WAITING_PROMPTS", "WAITING_INPUT"].includes(run.status)) return;
    const timer = setInterval(() => { refresh(projectId).catch(reason => setError(reason.message)); }, 2000);
    return () => clearInterval(timer);
  }, [projectId, run?.status]);

  async function refresh(id: string) {
    const latest = await read(await fetch(`/api/projects/${id}/detail-runs`)) as Run | null;
    setRun(latest);
    const project = await read(await fetch(`/api/projects/${id}`));
    setSections(project.sections || []);
    return latest;
  }

  async function start() {
    const heroes = mode === "detail" ? 0 : heroCount;
    const details = mode === "hero" ? 0 : detailCount;
    if (!files.length) { setError("至少上传或选择一张商品图。"); return; }
    if (heroes + details < 1) { setError("主图和详情不能同时为 0。"); return; }
    setBusy(true);
    setError("");
    try {
      const project = await read(await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: files[0].name.replace(/\.[^.]+$/, "").slice(0, 80).padEnd(2, "商品"), platform, style: "generic_clean", description: facts }) }));
      const plan = await read(await fetch("/api/workbench/size", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ width, height }) }));
      await read(await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: facts, modelSnapshot: { workType: "set", targetSize: { width, height }, platform } }) }));
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("source", "set");
        form.set("name", file.name);
        await fetch("/api/library", { method: "POST", body: form });
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        await read(await fetch(`/api/projects/${project.id}/assets/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "MAIN", fileName: file.name, mimeType: file.type || "image/png", base64Data: btoa(binary) }) }));
      }
      const created = await read(await fetch(`/api/projects/${project.id}/detail-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), heroCount: heroes, detailCount: details, imageSettings: { size: `${plan.requestWidth}x${plan.requestHeight}` }, language: "zh-CN", quality: "auto", mode: "create" }) }));
      setProjectId(project.id);
      setRun(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "准备失败");
    } finally { setBusy(false); }
  }

  async function act(action: string, body: unknown) {
    if (!projectId || !run) return false;
    setBusy(true);
    try {
      const next = await read(await fetch(`/api/projects/${projectId}/detail-runs/${run.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setRun(next);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
      return false;
    } finally { setBusy(false); }
  }

  const step = !run ? "准备" : run.status === "WAITING_PROMPTS" ? "确认分镜" : run.status === "WAITING_INPUT" ? "准备" : ["COMPLETED", "PARTIAL", "FAILED"].includes(run.status) ? "结果" : "生图";
  const images = sections.filter(section => section.currentImageAsset);
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-muted-foreground">做一套图</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{step === "确认分镜" ? "确认分镜和提示词" : step === "结果" ? "查看、修改和导出" : "先把商品和张数说清楚"}</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{step === "确认分镜" ? "系统已经出好分镜，请先逐页查看或修改。确认一次后，才会按这些页面一次生成。" : "准备好之后再出分镜。确认提示词前不会拿去生图。"}</p>
        </div>
        {run && step !== "准备" && <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setRun(null)}>返回准备</button>}
      </div>
      <ol className="mt-3 flex gap-3 text-xs text-muted-foreground"><li className={step === "准备" ? "font-semibold text-foreground" : ""}>1 准备</li><li className={step === "确认分镜" ? "font-semibold text-foreground" : ""}>2 确认分镜</li><li className={step === "生图" ? "font-semibold text-foreground" : ""}>3 生图</li><li className={step === "结果" ? "font-semibold text-foreground" : ""}>4 结果</li></ol>
      {!run && <div className="mt-4 space-y-4">
        <label className="block rounded-2xl border border-dashed bg-white p-6 text-center text-sm">上传或从素材库点选<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="mt-3 block w-full text-xs" onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
        <label className="block text-sm">已知事实（可选）<textarea value={facts} onChange={event => setFacts(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border px-3 py-3" /></label>
        <div className="flex flex-wrap gap-2">{(["hero", "detail", "both"] as const).map(item => <button key={item} type="button" onClick={() => setMode(item)} className={mode === item ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>{item === "hero" ? "只要主图" : item === "detail" ? "只要详情" : "两者都要"}</button>)}</div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">主图张数（0-10）<input value={heroCount} onChange={event => setHeroCount(Math.min(10, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
          <label className="text-sm">详情张数（0-20）<input value={detailCount} onChange={event => setDetailCount(Math.min(20, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
          <label className="text-sm">平台<select value={platform} onChange={event => setPlatform(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2">{platformOptions.map(item => <option key={item} value={item}>{platformLabels[item]}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap gap-2">{sizePresets.map(item => <button key={item.id} type="button" onClick={() => { setPreset(item.id); setWidth(item.width); setHeight(item.height); }} className={preset === item.id ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>{item.label}</button>)}<button type="button" onClick={() => setPreset("custom")} className={preset === "custom" ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>自定义</button></div>
        {preset === "custom" && <div className="flex gap-2"><input aria-label="宽度" value={width} onChange={event => setWidth(Number(event.target.value))} className="w-28 rounded-xl border px-3 py-2" /><input aria-label="高度" value={height} onChange={event => setHeight(Number(event.target.value))} className="w-28 rounded-xl border px-3 py-2" /></div>}
        {note && <p className="text-sm text-amber-800">{note}</p>}
        <p className="text-xs text-muted-foreground">默认电商用通用电商的版式来排，也可改成淘宝/天猫、拼多多、抖音或小红书。没有 Shopee 或 Lazada 专用预设。</p>
      </div>}
      {run?.status === "WAITING_INPUT" && <div className="mt-4 rounded-2xl border bg-white p-4 text-sm"><p>还需要补充一点信息才能出分镜。可以按现有已知事实继续，缺失项不会被当成已确认的测量值。</p><button type="button" className="mt-3 rounded-xl bg-foreground px-4 py-2 text-white" onClick={() => act("answers", { skip: true })}>按现有信息继续</button></div>}
      {run?.status === "WAITING_PROMPTS" && run.checkpoint?.promptReview?.pages?.length ? <div className="mt-4"><PromptReviewPanel review={run.checkpoint.promptReview as never} busy={busy} onSubmit={(action, data) => act(action, data)} /></div> : null}
      {step === "生图" && <p className="mt-4 text-sm">正在按已确认的页面生成。失败的张不会把整套悄悄重跑。{run?.stage}</p>}
      {step === "结果" && <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="rounded-xl border px-3 py-2" href={`/api/projects/${projectId}/export/images`}>导出全部 ZIP</a>
          <a className="rounded-xl bg-foreground px-3 py-2 text-white" href={`/api/projects/${projectId}/export/long-image`}>下载详情长图</a>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{sections.map(section => {
          const file = section.currentImageAsset?.filePath;
          const failed = !file;
          return <label key={section.id} className="rounded-2xl border bg-white p-2 text-xs">{file ? <img alt={section.title} src={`/api/files/${file.split("\\").join("/")}`} className="aspect-square w-full object-contain" /> : <div className="grid aspect-square place-items-center text-muted-foreground">未成功</div>}<span className="mt-2 flex items-center gap-2"><input type="checkbox" disabled={failed} checked={selected.includes(section.id)} onChange={event => setSelected(current => event.target.checked ? [...current, section.id] : current.filter(id => id !== section.id))} />{section.title}</span></label>;
        })}</div>
        <label className="block text-sm">批量修改说明<textarea value={editNote} onChange={event => setEditNote(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => Promise.all(selected.map(id => fetch(`/api/projects/${projectId}/sections/${id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: editNote, editMode: "repaint" }) }))).then(() => refresh(projectId))}>批量修改</button>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => Promise.all(selected.map(id => fetch(`/api/projects/${projectId}/sections/${id}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).then(() => refresh(projectId))}>批量重新生成</button>
        </div>
        {!images.length && <p className="text-sm text-muted-foreground">已成功的图会出现在这里。未成功的图不能勾选。</p>}
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {!run && <button type="button" disabled={busy} onClick={() => void start()} className="mt-4 h-12 w-full rounded-xl bg-foreground text-sm text-white">{busy ? "正在准备分镜…" : "去看分镜和提示词"}</button>}
    </div>
  );
}
