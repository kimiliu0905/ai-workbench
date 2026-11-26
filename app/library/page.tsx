"use client";

import { useEffect, useState } from "react";
import { librarySourceLabels, type LibrarySource } from "@/lib/product";

type Asset = { id: string; name: string; source: LibrarySource; createdAt: string; url: string };

async function read(response: Response) {
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "请求失败");
  return payload.data;
}

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [error, setError] = useState("");
  async function load(nextQ = q, nextSource = source) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextSource !== "all") params.set("source", nextSource);
    setAssets(await read(await fetch(`/api/library?${params}`)));
  }
  useEffect(() => { load().catch(reason => setError(reason.message)); }, []);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">素材库</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">做一张图、一套图和译图共用这一库</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">只存放图片。可搜索、按来源筛选、重命名、替换和删除。删除前会确认。已经加入任务的图继续使用当时的副本。</p>
        </div>
        <label className="rounded-xl bg-foreground px-4 py-2 text-sm text-white">上传图片<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set("file", file); form.set("source", "upload"); const response = await fetch("/api/library", { method: "POST", body: form }); if (!response.ok) setError("上传失败"); else await load(); }} /></label>
      </div>
      <div className="mt-4 flex gap-2">
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="按名称搜索" className="flex-1 rounded-xl border px-3 py-2 text-sm" />
        <select value={source} onChange={event => { setSource(event.target.value); load(q, event.target.value).catch(reason => setError(reason.message)); }} className="rounded-xl border bg-white px-3 py-2 text-sm">
          <option value="all">全部来源</option>
          {Object.entries(librarySourceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => load().catch(reason => setError(reason.message))}>搜索</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {!assets.length && <p className="mt-6 text-sm text-muted-foreground">库是空的。可以在这里上传，或在做一张图、做一套图、译图里上传后自动出现。聊天图片和生成结果不会自动出现。</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {assets.map(asset => <article key={asset.id} className="rounded-2xl border bg-white p-2 text-xs">
          <img alt={asset.name} src={asset.url} className="aspect-square w-full object-contain" />
          <p className="mt-2 font-medium">{asset.name}</p>
          <p className="text-muted-foreground">{librarySourceLabels[asset.source] || asset.source} · {new Date(asset.createdAt).toLocaleString("zh-CN", { hour12: false })}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={async () => { const name = window.prompt("新名称", asset.name); if (!name) return; await read(await fetch("/api/library", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: asset.id, name }) })); await load(); }}>重命名</button>
            <label>替换<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set("id", asset.id); form.set("file", file); await fetch("/api/library", { method: "PUT", body: form }); await load(); }} /></label>
            <button type="button" onClick={async () => { if (!window.confirm("删除后不能再被新任务点选。已加入任务的副本仍会保留。")) return; await read(await fetch(`/api/library?id=${asset.id}`, { method: "DELETE" })); await load(); }}>删除</button>
          </div>
        </article>)}
      </div>
    </div>
  );
}
