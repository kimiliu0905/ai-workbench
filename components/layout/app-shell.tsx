"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronDown, ImageIcon, MessageSquare, Settings } from "lucide-react";

const mainLinks = [
  { href: "/chat", label: "聊天", icon: MessageSquare },
  { href: "/compose", label: "做图", icon: ImageIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inWorkspace = pathname === "/" || pathname === "/chat" || pathname === "/compose" || pathname === "/settings";
  return (
    <div className="wb-shell">
      <header className="wb-top">
        <Link href="/chat" className="wb-brand" aria-label="椰子酱工作台">
          <span aria-hidden="true">椰</span>椰子酱工作台
        </Link>
        <nav aria-label="主导航" className="wb-nav">
          {mainLinks.map(({ href, label, icon: Icon }) => {
            const current = pathname === href || (href === "/chat" && pathname === "/");
            return <Link key={href} href={href} aria-current={current ? "page" : undefined}><Icon size={17} />{label}</Link>;
          })}
        </nav>
        <div className="wb-top-tools">
          <details className="wb-more" key={pathname}>
            <summary>更多 <ChevronDown size={13} /></summary>
            <div>
              {[["/set", "做一套图"], ["/translate", "译图"], ["/history", "旧任务"], ["/agent", "Agent"]].map(([href, label]) =>
                <Link key={href} href={href}>{label}<ArrowUpRight size={13} /></Link>)}
            </div>
          </details>
          <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}><Settings size={17} /> 设置</Link>
        </div>
      </header>
      <main className={inWorkspace ? "wb-main" : "wb-legacy"}>{children}</main>
    </div>
  );
}
