"use client";

import { useEffect } from "react";
import { translationQueue } from "@/lib/translation/client-queue";

export function WorkbenchPoller() {
  useEffect(() => {
    translationQueue.hydrate();
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void translationQueue.tick();
    };
    tick();
    const timer = window.setInterval(tick, 2500);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return null;
}
