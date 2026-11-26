"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export function WorkbenchFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(pathname === "/login");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session").then(response => response.json()).then(payload => {
      if (cancelled) return;
      const status = payload.data || {};
      if (pathname === "/login") {
        if (status.authenticated && !status.needsSetup) router.replace("/");
        else setReady(true);
        return;
      }
      if (status.required && !status.authenticated) router.replace("/login");
      else setReady(true);
    }).catch(() => setReady(true));
    return () => { cancelled = true; };
  }, [pathname, router]);
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">正在打开工作台…</div>;
  if (pathname === "/login") return children;
  return <AppShell>{children}</AppShell>;
}
