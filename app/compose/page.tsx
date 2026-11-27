"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, BookmarkPlus, FolderOpen, ImageIcon, Layers3, Maximize2, Plus, Sparkles, X } from "lucide-react";
import { useImagePreview } from "@/components/shared/image-preview-provider";
import { WorkbenchSetup } from "@/components/layout/workbench-setup";
import { readWorkbench, sendJson } from "@/lib/workbench/client";
import { referenceUseOptions, sizePresets } from "@/lib/product";
import type { ComposeDraft, ComposeVersion, ComposeSlot } from "@/lib/workbench/compose";

type Summary = { id: string; title: string; width: number; height: number };
type Job = Summary & ComposeDraft & {
  frameCopyPath?: string; productCopyPath?: string; referenceCopyPath?: string;
  versions: ComposeVersion[]; error?: string;
};
type Template = ComposeDraft & { id: string; name: string; frameCopyPath?: string };

const slots = [
  { id: "frame", label: "主图框", field: "frameCopyPath" },
  { id: "product", label: "产品图", field: "productCopyPath" },
  { id: "reference", label: "参考图", field: "referenceCopyPath" },
] as const;

const emptyDraft: ComposeDraft = { width: 1024, height: 1024, instruction: "", referenceUse: "look", referenceNote: "" };

function draftFrom({ width, height, instruction, referenceUse, referenceNote }: ComposeDraft): ComposeDraft {
  return { width, height, instruction, referenceUse, referenceNote };
}

export default function ComposePage() {
  const [jobs, setJobs] = useState<Summary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [library, setLibrary] = useState<{ id: string; name: string }[]>([]);
  const [librarySlot, setLibrarySlot] = useState<ComposeSlot | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [revision, setRevision] = useState("");
  const [versionId, setVersionId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("");
  const locked = useRef(false);
  const pendingDraft = useRef<Promise<Job> | null>(null);
  const { openImagePreview } = useImagePreview();
  const shown = job?.versions.find(version => version.id === versionId) || job?.versions.at(-1);
  const shownIndex = shown ? job!.versions.indexOf(shown) + 1 : 0;
  const download = shown ? `/api/compose/download?jobId=${job?.id}&versionId=${shown.id}` : "";
  const preview = download && download + "&preview=1";
  const hasInputs = slots.some(slot => job?.[slot.field]);
  const dimensionsValid = [draft.width, draft.height].every(value => Number.isInteger(value) && value >= 16 && value <= 3840) && draft.width * draft.height <= 8_294_400;

  function list() {
    return fetch("/api/compose").then(readWorkbench<{ jobs: Summary[]; templates: Template[] }>);
  }
  function load(id: string) {
    return fetch(`/api/compose?id=${id}`).then(readWorkbench<Job>);
  }
  function patch<T>(jobId: string, action: string, extra: object = {}) {
    return fetch("/api/compose", sendJson("PATCH", { jobId, action, ...extra })).then(readWorkbench<T>);
  }
  function sync(next: Job) {
    setJob(next);
    setJobs(items => [next, ...items.filter(item => item.id !== next.id)]);
  }
  function open(next: Job | null) {
    setJob(next);
    setDraft(next ? draftFrom(next) : emptyDraft);
    setVersionId(next?.versions.at(-1)?.id || "");
    setRevision("");
    setSavedName(null);
    setLibrarySlot(null);
    setError(next?.error || "");
    setMessage("");
    setSaveState("");
    window.history.replaceState(null, "", next ? `/compose?job=${next.id}` : "/compose");
  }

  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("job");
    list().then(async data => {
      const selected = id && data.jobs.some(item => item.id === id) ? await load(id) : null;
      if (active) {
        setJobs(data.jobs);
        setTemplates(data.templates);
        if (selected) open(selected);
      }
    }).catch(reason => {
      if (active) setError(reason.message);
    }).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!job || busy || !dimensionsValid) return;
    const persisted = draftFrom(job);
    if (JSON.stringify(persisted) === JSON.stringify({ ...draft, instruction: draft.instruction.trim(), referenceNote: draft.referenceNote.trim() })) return;
    const timer = setTimeout(() => {
      if (locked.current) return;
      setSaveState("保存中…");
      const request = Promise.resolve(pendingDraft.current).catch(() => {}).then(() => patch<Job>(job.id, "draft", { draft }));
      pendingDraft.current = request;
      request.then(updated => {
        sync(updated);
        setSaveState("草稿已保存");
      }, () => setSaveState("草稿保存失败"))
        .finally(() => { if (pendingDraft.current === request) pendingDraft.current = null; });
    }, 400);
    return () => clearTimeout(timer);
  }, [job, draft, busy, dimensionsValid]);

  async function run(label: string, action: () => Promise<void>) {
    if (locked.current || !ready) return;
    locked.current = true;
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await pendingDraft.current?.catch(() => {});
      await action();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
      locked.current = false;
    }
  }

  async function ensureJob(input = draft) {
    if (job) return job;
    const { job: next } = await readWorkbench<{ job: Job }>(await fetch("/api/compose", sendJson("POST", input)));
    sync(next);
    window.history.replaceState(null, "", `/compose?job=${next.id}`);
    return next;
  }

  async function persistDraft() {
    if (!dimensionsValid) throw new Error("请填写有效的输出尺寸。");
    if (job) sync(await patch<Job>(job.id, "draft", { draft }));
  }

  function attach(slot: ComposeSlot, file?: File, libraryId?: string) {
    void run("正在保存素材…", async () => {
      const current = await ensureJob();
      const form = new FormData();
      form.set("jobId", current.id);
      form.set("slot", slot);
      if (file) form.set("file", file);
      else if (libraryId) form.set("libraryId", libraryId);
      else form.set("remove", "1");
      sync(await readWorkbench<Job>(await fetch("/api/compose", { method: "PUT", body: form })));
      setLibrarySlot(null);
    });
  }

  function chooseTemplate(template: Template) {
    void run("正在套用模板…", async () => {
      const current = await ensureJob(draftFrom(template));
      const next = await patch<Job>(current.id, "apply-template", { templateId: template.id });
      sync(next);
      setDraft(draftFrom(next));
      setMessage(`已套用「${template.name}」。`);
    });
  }

  function generate(change?: string) {
    void run(change ? "正在修改所选版本…" : "正在生成图片…", async () => {
      const current = await ensureJob();
      const next = await patch<Job>(current.id, "generate", { draft, ...(change ? { revision: change, versionId: shown?.id } : {}) });
      sync(next);
      setVersionId(next.versions.at(-1)?.id || "");
      if (change) setRevision("");
      setMessage("图片已生成，可以查看或下载。");
    });
  }

  return (
    <div className="wb-studio">
      <aside className="wb-history wb-studio-history">
        <div className="wb-history-heading"><h2>做图任务</h2><button className="wb-icon" type="button" title="新建任务" aria-label="新建任务" disabled={!!busy} onClick={() => void run("正在切换…", async () => { if (job && dimensionsValid) await persistDraft(); open(null); })}><Plus size={19} /></button></div>
        <div className="wb-history-list">
          {jobs.length === 0 && ready && <p>添加素材或保存草稿后，任务会出现在这里。</p>}
          {jobs.map(item => <button type="button" key={item.id} aria-pressed={job?.id === item.id} disabled={!!busy} onClick={() => void run("正在打开任务…", async () => { if (job && job.id !== item.id && dimensionsValid) await persistDraft(); open(await load(item.id)); })}><ImageIcon size={15} /><span>{item.title}<small>{item.width} × {item.height}</small></span></button>)}
        </div>
      </aside>

      <section className="wb-studio-editor">
        <div className="wb-studio-heading"><h1>做图</h1><span>{saveState}</span></div>
        <WorkbenchSetup />
        <fieldset disabled={!!busy || !ready}>
          <div className="wb-editor-label"><h2>素材</h2>
            {templates.length > 0 && <select aria-label="套用模板" value="" onChange={event => { const template = templates.find(item => item.id === event.target.value); if (template) chooseTemplate(template); }}>
              <option value="">套用模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>}
          </div>
          <div className="wb-asset-grid">
            {slots.map(({ id, label, field }) => {
              const source = job?.[field] ? `/api/compose?id=${job.id}&slot=${id}&v=${encodeURIComponent(job[field] || "")}` : "";
              return <div className="wb-asset" key={id}>
                <div className="wb-asset-thumb">
                  {source ? <button type="button" className="wb-image-trigger" aria-label={`查看${label}`} onClick={() => openImagePreview({ url: source, title: label })}><img src={source} alt={label} /></button> : <div><ImageIcon size={23} strokeWidth={1.4} /></div>}
                  {source && <button className="wb-asset-remove wb-icon" type="button" aria-label={`移除${label}`} onClick={() => attach(id)}><X size={13} /></button>}
                </div>
                <strong>{label}</strong>
                <div className="wb-asset-actions">
                  <label className="wb-upload">{source ? "替换" : "上传"}<input type="file" aria-label={`上传${label}`} accept="image/png,image/jpeg,image/webp" onChange={event => {
                    if (event.target.files?.[0]) attach(id, event.target.files[0]);
                    event.target.value = "";
                  }} /></label>
                  <button type="button" aria-label={`从素材库选择${label}`} title="从素材库选择" onClick={() => {
                    setLibrarySlot(id);
                    fetch("/api/library").then(readWorkbench<{ id: string; name: string }[]>).then(setLibrary).catch(reason => setError(reason.message));
                  }}><FolderOpen size={15} /></button>
                </div>
              </div>;
            })}
          </div>
          {librarySlot && <div className="wb-inline-controls">
            <select aria-label="选择素材" value="" onChange={event => { if (event.target.value) attach(librarySlot, undefined, event.target.value); }}><option value="">{library.length ? "从素材库选择" : "素材库暂无图片"}</option>{library.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button type="button" className="wb-icon" aria-label="关闭素材库选择" onClick={() => setLibrarySlot(null)}><X size={17} /></button>
          </div>}
          {job?.referenceCopyPath && <div className="wb-editor-field">
            <label htmlFor="wb-reference-use">参考图用途</label>
            <select id="wb-reference-use" value={draft.referenceUse} onChange={event => setDraft({ ...draft, referenceUse: event.target.value })}>{referenceUseOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            {draft.referenceUse === "custom" && <input aria-label="参考图说明" value={draft.referenceNote} maxLength={1000} onChange={event => setDraft({ ...draft, referenceNote: event.target.value })} placeholder="例如，取出参考图里的植物放到左下角" />}
          </div>}
          <div className="wb-editor-field">
            <label htmlFor="wb-instructions">制作要求</label>
            <textarea id="wb-instructions" rows={3} maxLength={10000} value={draft.instruction} onChange={event => setDraft({ ...draft, instruction: event.target.value })} placeholder="例如，保留主图框和原有文字，将商品居中摆放。" />
          </div>
          <div className="wb-editor-field">
            <label htmlFor="wb-size-preset">输出尺寸</label>
            <div className="wb-size">
              <input type="number" min={16} max={3840} value={draft.width || ""} onChange={event => setDraft({ ...draft, width: Number(event.target.value) })} aria-label="宽度" />
              <span>×</span>
              <input type="number" min={16} max={3840} value={draft.height || ""} onChange={event => setDraft({ ...draft, height: Number(event.target.value) })} aria-label="高度" />
              <select id="wb-size-preset" aria-label="尺寸预设" value={sizePresets.find(size => size.width === draft.width && size.height === draft.height)?.id || ""} onChange={event => {
                const size = sizePresets.find(option => option.id === event.target.value);
                if (size) setDraft({ ...draft, width: size.width, height: size.height });
              }}><option value="">自定义</option>{sizePresets.map(size => <option key={size.id} value={size.id}>{size.label}</option>)}</select>
            </div>
            {!dimensionsValid && <small className="wb-error">宽和高需为 16 到 3840 的整数，总像素最多 829 万。</small>}
          </div>
          <div className="wb-editor-actions">
            <button className="wb-button" type="button" disabled={!dimensionsValid || (!job && !draft.instruction.trim())} onClick={() => void run("正在保存草稿…", async () => {
              if (job) await persistDraft(); else await ensureJob();
              setSaveState("草稿已保存");
            })}>保存草稿</button>
            <button className="wb-button" type="button" disabled={!dimensionsValid || (!hasInputs && !draft.instruction.trim())} onClick={() => setSavedName(savedName === null ? "" : null)}><BookmarkPlus size={16} /> 存为模板</button>
          </div>
          {savedName !== null && <form className="wb-inline-controls" onSubmit={event => {
            event.preventDefault();
            void run("正在保存模板…", async () => {
              const current = await ensureJob();
              const template = await patch<Template>(current.id, "save-template", { name: savedName, draft });
              setTemplates(value => [template, ...value]);
              setSavedName(null);
              setMessage("模板已保存。新任务里可直接套用主图框、要求和尺寸。");
            });
          }}>
            <input aria-label="模板名称" placeholder="模板名称" value={savedName} maxLength={80} onChange={event => setSavedName(event.target.value)} />
            <button className="wb-button" type="submit" disabled={!savedName.trim()}>保存模板</button>
          </form>}
          <button className="wb-button wb-primary wb-generate" type="button" disabled={!dimensionsValid || (!hasInputs && !draft.instruction.trim())} onClick={() => generate()}><Sparkles size={17} /> 生成图片</button>
        </fieldset>
        {busy && <p role="status" className="wb-progress">{busy}</p>}
        {error && <p role="alert" className="wb-error">{error}</p>}
        {message && <p role="status" className="wb-feedback">{message}</p>}
      </section>

      <section className="wb-result">
        <header className="wb-result-header"><div><h2>结果预览</h2><p>{shown ? `第 ${shownIndex} 版 · ${shown.width} × ${shown.height} px` : "生成的图片会显示在这里"}</p></div>
          {shown && <div><button className="wb-icon" type="button" title="查看大图" aria-label="查看大图" onClick={() => openImagePreview({ url: preview, title: `第 ${shownIndex} 版`, meta: `${shown.width} × ${shown.height} px` })}><Maximize2 size={17} /></button><a className="wb-button wb-primary" href={download} download><ArrowDownToLine size={17} /> 下载 PNG</a></div>}
        </header>
        <div className="wb-canvas" aria-busy={busy.includes("生成") || busy.includes("修改")}>
          {shown ? <button className="wb-result-picture" type="button" aria-label="放大生成结果" onClick={() => openImagePreview({ url: preview, title: `第 ${shownIndex} 版` })}><img src={preview} alt={`第 ${shownIndex} 版生成结果`} /></button> :
            <div className="wb-canvas-empty"><div className="wb-mark"><Layers3 size={30} strokeWidth={1.5} /></div><p>{busy.includes("生成") ? "正在制作图片…" : "暂无图片"}</p></div>}
        </div>
        {shown && <div className="wb-versions">
          <h3>版本</h3>
          <div className="wb-version-strip">{job!.versions.map((version, index) => <button type="button" key={version.id} disabled={!!busy} aria-pressed={shown.id === version.id} aria-label={`第 ${index + 1} 版`} className="wb-version" onClick={() => setVersionId(version.id)}>
            <img src={`/api/compose/download?jobId=${job!.id}&versionId=${version.id}&preview=1`} alt="" /><span>第 {index + 1} 版</span>
          </button>)}</div>
          <form className="wb-edit" onSubmit={event => { event.preventDefault(); if (revision.trim()) generate(revision); }}>
            <label htmlFor="wb-revision">修改第 {shownIndex} 版</label>
            <textarea id="wb-revision" rows={2} maxLength={10000} value={revision} disabled={!!busy} onChange={event => setRevision(event.target.value)} placeholder="例如，把背景改浅一些，商品位置保持不动。" />
            <div><button type="button" className="wb-button" disabled={!!busy} onClick={() => void run("正在存入素材库…", async () => {
              await patch(job!.id, "save-result", { versionId: shown.id });
              setMessage(`第 ${shownIndex} 版已存入素材库。`);
            })}>存入素材库</button><button type="submit" className="wb-button wb-primary" disabled={!!busy || !revision.trim() || !dimensionsValid}>继续修改</button></div>
          </form>
        </div>}
      </section>
    </div>
  );
}
