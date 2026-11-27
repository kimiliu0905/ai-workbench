"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/product";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/auth/session").then(response => response.json()).then(payload => setNeedsSetup(Boolean(payload.data?.needsSetup))).catch(() => undefined);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error?.message || "口令不正确，请再试一次。");
      return;
    }
    router.replace("/");
    router.refresh();
  }
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-border bg-white p-6 shadow-[0_24px_60px_-38px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <img src="/brand-icon.ico" alt="" className="h-10 w-10 rounded-2xl border" />
          <div>
            <p className="font-semibold">{PRODUCT_NAME}</p>
            <p className="text-xs text-muted-foreground">装在这台电脑上使用</p>
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{needsSetup ? "设定共享口令" : "输入共享口令进入"}</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">输入共享口令，进入这台电脑上的工作台。</p>
        <label className="mt-5 block text-sm font-medium">共享口令
          <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-3 outline-none focus:border-foreground" />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-xl bg-foreground text-sm font-medium text-white shadow-md disabled:opacity-60">{busy ? "正在进入…" : "进入"}</button>
      </form>
    </div>
  );
}
