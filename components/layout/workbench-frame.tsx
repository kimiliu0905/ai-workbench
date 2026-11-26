"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export function WorkbenchFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session").then(response => response.json()).then(payload => {
      if (cancelled) return;
      const status = payload.data || {};
      if (pathname === "/login") {
        if (status.authenticated && !status.needsSetup) router.replace("/");
        return;
      }
      if (status.required && !status.authenticated) router.replace("/login");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname, router]);
  if (pathname === "/login") return children;
  return <AppShell>{children}</AppShell>;
}
