"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    yezijianData?: { location(): Promise<string>; move(): Promise<void> };
  }
}

export function DesktopDataLocation() {
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void window.yezijianData?.location().then(setLocation).catch(() => setError("找不到当前数据位置。"));
  }, []);

  async function move() {
    setBusy(true);
    setError("");
    try {
      await window.yezijianData?.move();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method .*?: Error: /, "") : "无法更改数据位置。");
    } finally {
      setBusy(false);
    }
  }

  if (!location && !error) return null;

  return (
    <section className="wb-setting-section">
      <div className="wb-setting-title"><h2>数据位置</h2></div>
      <p className="break-all">{location}</p>
      <p>聊天、图片、模板和备份可以迁到其他磁盘。请选择新位置，例如 D 盘。</p>
      <div><button type="button" className="wb-button" disabled={busy || !location} onClick={() => void move()}>更改数据位置</button></div>
      {busy && <p role="status">请完成文件夹选择，迁移时请保持应用打开。</p>}
      {error && <p className="wb-error" role="alert">{error}</p>}
    </section>
  );
}
