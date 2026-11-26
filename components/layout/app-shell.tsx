"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, House, ImageIcon, Images, Languages, MessageSquare, Settings } from "lucide-react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "首页", icon: House },
  { href: "/chat", label: "聊天", icon: MessageSquare },
  { href: "/compose", label: "做一张图", icon: ImageIcon },
  { href: "/set", label: "做一套图", icon: Images },
  { href: "/translate", label: "译图", icon: Languages },
  { href: "/agent", label: "Agent", icon: Bot },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1440px] gap-4 px-4 py-4 md:px-5">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[16.5rem] shrink-0 flex-col rounded-[2rem] border border-border bg-card p-4 shadow-[0_24px_60px_-38px_rgba(0,0,0,0.28)] md:flex">
          <Link href="/" className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-white">
              <img src="/brand-icon.ico" alt="" className="h-8 w-8" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-5">{PRODUCT_NAME}</span>
              <span className="block text-xs text-muted-foreground">{PRODUCT_TAGLINE}</span>
            </span>
          </Link>
          <nav aria-label="主导航" className="mt-4 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const on = active(item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm", on ? "border border-foreground bg-white font-medium shadow-sm" : "text-muted-foreground hover:bg-white hover:text-foreground")}>
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-2xl border border-border bg-white p-3 text-xs leading-5 shadow-sm">
            <p className="font-medium text-foreground">已进入</p>
            <p className="mt-1 font-semibold">本机工作台</p>
            <p className="mt-2 text-muted-foreground">数据保存在这台电脑。Kimi 也在同一台电脑上使用同一份数据。</p>
            <Link href="/settings" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
              <Settings className="h-4 w-4" />设置
            </Link>
          </div>
        </aside>
        <main className="flex min-h-[calc(100vh-2rem)] min-w-0 flex-1 flex-col rounded-[2rem] border border-border bg-card p-5 shadow-[0_24px_60px_-38px_rgba(0,0,0,0.28)] md:p-6">
          <nav aria-label="移动端主导航" className="mb-4 flex gap-2 overflow-auto md:hidden">
            {navItems.map(item => <Link key={item.href} href={item.href} className="shrink-0 rounded-xl border px-3 py-2 text-sm">{item.label}</Link>)}
            <Link href="/settings" className="shrink-0 rounded-xl border px-3 py-2 text-sm">设置</Link>
          </nav>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}
