"use client";

import { useEffect, useState } from "react";
import { imageModelOptions, referenceUseOptions, sizePresets } from "@/lib/product";

type Plan = { legal: boolean; note: string; requestWidth: number; requestHeight: number };
type Job = { id: string; width: number; height: number; sizeNote: string; instruction: string; referenceUse: string; referenceNote: string; versions: Array<{ id: string; filePath: string; note: string }>; status: string };
type Template = { id: string; name: string; instruction: string; referenceUse: string; referenceNote: string; width: number; height: number };

async function read(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload.data;
}

export default function ComposePage() {
  const [preset, setPreset] = useState("1024x1024");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [instruction, setInstruction] = useState("");
  const [referenceUse, setReferenceUse] = useState("frame");
  const [referenceNote, setReferenceNote] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: string; name: string }>>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [revision, setRevision] = useState("");
  const [versionId, setVersionId] = useState("");
  useEffect(() => { fetch("/api/library").then(read).then(setLibrary).catch(() => undefined); }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    fetch(id ? `/api/compose?id=${encodeURIComponent(id)}` : "/api/compose").then(read).then(data => {
      setTemplates(data.templates || []);
      const found = data.job || (id ? (data.jobs || []).find((item: Job) => item.id === id) : null);
      if (!found) return;
      setJob(found);
      setInstruction(found.instruction || "");
      setReferenceUse(found.referenceUse || "frame");
      setReferenceNote(found.referenceNote || "");
      setWidth(found.width);
      setHeight(found.height);
      setPreset("custom");
      setVersionId(found.versions?.at(-1)?.id || "");
    }).catch(reason => setError(reason.message));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { fetch("/api/workbench/size", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ width, height }) }).then(read).then(setPlan).catch(reason => setError(reason.message)); }, 200);
    return () => clearTimeout(timer);
  }, [width, height]);
  function choosePreset(id: string) {
    setPreset(id);
    const found = sizePresets.find(item => item.id === id);
    if (found) { setWidth(found.width); setHeight(found.height); }
  }
  async function ensureJob() {
    if (job) return job;
    const created = await read(await fetch("/api/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ width, height, instruction, referenceUse, referenceNote }) }));
    setJob(created.job);
    return created.job as Job;
  }
  async function upload(slot: "frame" | "product" | "reference", file?: File | null, libraryId?: string) {
    setError("");
    const current = await ensureJob();
    const form = new FormData();
    form.set("jobId", current.id);
    form.set("slot", slot);
    if (libraryId) form.set("libraryId", libraryId);
    if (file) form.set("file", file);
    await read(await fetch("/api/compose", { method: "PUT", body: form }));
  }
  function applyTemplate(template: Template) {
    setInstruction(template.instruction || "");
    setReferenceUse(template.referenceUse || "frame");
    setReferenceNote(template.referenceNote || "");
    setWidth(template.width);
    setHeight(template.height);
    setPreset("custom");
    if (!job) return;
    fetch("/api/compose", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, templateId: template.id }) }).then(read).then(setJob).catch(reason => setError(reason.message));
  }
  async function generate(nextRevision?: string) {
    setBusy(true);
    setError("");
    try {
      const current = await ensureJob();
      const updated = await read(await fetch("/api/compose", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: current.id, instruction, revision: nextRevision || undefined }) }));
      setJob(updated);
      setVersionId(updated.versions?.at(-1)?.id || "");
      if (nextRevision) setRevision("");
      if (!window.location.search.includes("job=")) window.history.replaceState(null, "", `/compose?job=${current.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败"); }
    finally { setBusy(false); }
  }
  async function saveResult() {
    if (!job) return;
    await read(await fetch("/api/compose", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, save: true }) }));
    setError("");
    alert("已存入素材库。生成结果默认不会自动入库。");
  }
  const latest = job?.versions?.at(-1);
  const shown = job?.versions?.find(version => version.id === versionId) || latest;
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-muted-foreground">做一张图</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">用三个槽位，组合出一张图</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">主图框、产品图、参考图可以只填需要的槽。至少有一张图或一段说明即可生成。尺寸一旦确定，本次生成和后续修改都用同一目标。</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {(["frame", "product", "reference"] as const).map(slot => (
              <div key={slot} className="rounded-2xl border border-dashed bg-white p-4 text-center text-sm">
                <p className="font-medium">{slot === "frame" ? "主图框 / 模板" : slot === "product" ? "产品图" : "参考图"}</p>
                <label className="mt-3 block cursor-pointer text-xs text-muted-foreground">上传或从库中点选<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs" onChange={event => upload(slot, event.target.files?.[0]).catch(reason => setError(reason.message))} /></label>
                <select aria-label={`${slot} 素材`} className="mt-2 w-full rounded-lg border px-2 py-2 text-xs" defaultValue="" onChange={event => { if (event.target.value) upload(slot, null, event.target.value).catch(reason => setError(reason.message)); }}>
                  <option value="">从素材库点选</option>
                  {library.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-medium">参考图用途</p>
            <div className="mt-2 flex flex-wrap gap-2">{referenceUseOptions.map(item => <button key={item.id} type="button" onClick={() => setReferenceUse(item.id)} className={referenceUse === item.id ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>{item.label}</button>)}</div>
            {referenceUse === "custom" && <input value={referenceNote} onChange={event => setReferenceNote(event.target.value)} placeholder="说明这张参考图要怎么用" className="mt-2 w-full rounded-xl border px-3 py-2 text-sm" />}
          </div>
          <label className="block text-sm font-medium">文字说明<textarea value={instruction} onChange={event => setInstruction(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border bg-white px-3 py-3 text-sm" placeholder="说明怎么处理和组合。" /></label>
          <div>
            <p className="text-sm font-medium">套用模板</p>
            <p className="mt-1 text-xs text-muted-foreground">模板只带上槽位说明、常用要求和默认尺寸，不带图片。</p>
            <div className="mt-2 flex flex-wrap gap-2">{templates.length ? templates.map(template => <button key={template.id} type="button" className="rounded-full border px-3 py-1.5 text-xs" onClick={() => applyTemplate(template)}>{template.name}</button>) : <p className="text-xs text-muted-foreground">还没有模板。生成前可把当前说明存成模板。</p>}</div>
          </div>
          <div>
            <p className="text-sm font-medium">输出尺寸</p>
            <div className="mt-2 flex flex-wrap gap-2">{sizePresets.map(item => <button key={item.id} type="button" onClick={() => choosePreset(item.id)} className={preset === item.id ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>{item.label}</button>)}<button type="button" onClick={() => setPreset("custom")} className={preset === "custom" ? "rounded-full bg-foreground px-3 py-1.5 text-xs text-white" : "rounded-full border px-3 py-1.5 text-xs"}>自定义</button></div>
            {preset === "custom" && <div className="mt-2 flex gap-2"><input aria-label="宽度" value={width} onChange={event => setWidth(Number(event.target.value))} className="w-28 rounded-xl border px-3 py-2" /><input aria-label="高度" value={height} onChange={event => setHeight(Number(event.target.value))} className="w-28 rounded-xl border px-3 py-2" /></div>}
            {plan && !plan.legal && <p role="status" className="mt-2 text-sm text-amber-800">{plan.note}</p>}
          </div>
        </div>
        <aside className="rounded-2xl border bg-white p-4">
          <p className="text-sm font-medium">结果预览</p>
          <p className="text-xs text-muted-foreground">{width}×{height}</p>
          {shown && job ? <img alt="生成结果" src={`/api/compose/download?jobId=${job.id}&versionId=${shown.id}&preview=1`} className="mt-3 max-h-64 w-full object-contain" /> : <p className="mt-8 text-center text-sm text-muted-foreground">还没有结果。填好槽位或说明后点「生成」。</p>}
          {shown && <p className="mt-3 text-xs text-muted-foreground">结果已按目标尺寸 {width}×{height} 收尾，可下载。生成结果不会自动进入素材库。</p>}
          {job?.versions?.length ? <div className="mt-3 space-y-1"><p className="text-xs font-medium">版本列表</p>{job.versions.map((version, index) => <button key={version.id} type="button" className={`block w-full rounded-lg px-2 py-1 text-left text-xs ${version.id === shown?.id ? "bg-muted" : ""}`} onClick={() => setVersionId(version.id)}>第 {index + 1} 版{version.note ? ` · ${version.note}` : ""}</button>)}</div> : null}
          {shown && <div className="mt-3 flex flex-col gap-2"><a className="rounded-xl border px-3 py-2 text-center text-sm" href={`/api/compose/download?jobId=${job?.id}&versionId=${shown.id}`}>下载</a><button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => saveResult().catch(reason => setError(reason.message))}>存入素材库</button></div>}
          {shown && <label className="mt-3 block text-xs">继续修改<textarea value={revision} onChange={event => setRevision(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-2 py-2 text-sm" placeholder="在上一版上追加修改说明" /></label>}
          {shown && <button type="button" disabled={busy || !revision.trim()} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm" onClick={() => void generate(revision)}>继续修改</button>}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">默认生图模型 {imageModelOptions[0]}。精细编辑不够时，到设置改为 {imageModelOptions[1]}。</p>
        </aside>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void generate()} className="mt-4 h-12 w-full rounded-xl bg-foreground text-sm text-white">{busy ? "正在生成…" : "生成"}</button>
    </div>
  );
}
