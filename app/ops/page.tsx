"use client";

import { useEffect, useState } from "react";

export default function OpsPage() {
  const [message, setMessage] = useState("这是给 Kimi 的本机运维入口，不在日常导航里。");
  const [keyConfigured, setKeyConfigured] = useState(false);
  useEffect(() => { fetch("/api/ops/backup").then(response => response.json()).then(payload => setKeyConfigured(Boolean(payload.data?.keyConfigured))).catch(() => undefined); }, []);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">本机运维</h1>
      <p className="text-sm leading-7 text-muted-foreground">{message} 使用人的设置页不展示监控或消耗热力图。备份是这台电脑上的复制，不上传。</p>
      <p className="text-sm">模型密钥：{keyConfigured ? "已由主进程配置，页面不显示内容。" : "尚未写入。请在用户数据目录的 config/secrets.json 里设置 openaiApiKey 后重新打开工作台。"}</p>
      <button type="button" className="rounded-xl bg-foreground px-4 py-2 text-sm text-white" onClick={async () => {
        const response = await fetch("/api/ops/backup", { method: "POST" });
        const payload = await response.json();
        setMessage(response.ok ? `已复制到 ${payload.data.directory}` : payload.error?.message || "备份失败");
      }}>立即备份数据库和图片</button>
    </div>
  );
}
