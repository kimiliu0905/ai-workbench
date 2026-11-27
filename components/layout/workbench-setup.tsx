"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { readWorkbench } from "@/lib/workbench/client";

export function WorkbenchSetup() {
  const [needsKey, setNeedsKey] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/workbench/settings").then(readWorkbench<{ keyConfigured: boolean }>).then(({ keyConfigured }) => {
      if (active) setNeedsKey(!keyConfigured);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!needsKey) return null;
  return <div className="wb-setup"><KeyRound size={17} /><span>首次使用，请先连接 OpenAI。</span><Link href="/settings">配置 API Key <ArrowRight size={15} /></Link></div>;
}
