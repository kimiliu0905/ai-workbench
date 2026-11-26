import Link from "next/link";
import { Bot, ImageIcon, Images, Languages, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function when(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

export default async function HomePage() {
  const [chats, jobs, projects] = await Promise.all([
    prisma.chatSession.findMany({ orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.composeJob.findMany({ orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.project.findMany({
      where: { platform: { not: "__mxpage_system_task__" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { detailRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);
  const tasks = [
    ...jobs.map(job => ({ href: `/compose?job=${job.id}`, title: job.title, meta: `${job.width}×${job.height} · ${when(job.updatedAt)}`, kind: "做一张图" })),
    ...projects.map(project => {
      const snap = project.modelSnapshot as { workType?: string } | null;
      const run = project.detailRuns[0];
      const kind = snap?.workType === "translation" ? "译图" : "做一套图";
      const href = snap?.workType === "translation" ? "/translate" : `/set?project=${project.id}`;
      return { href, title: project.name, meta: `${kind} · ${run?.stage || project.status} · ${when(project.updatedAt)}`, kind };
    }),
  ].slice(0, 4);
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm text-muted-foreground">椰子酱电商工作台</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">今天要从哪一步开始？</h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">聊天、做一张图或做一套图都可以直接进入，不必先做规划。译图和 Agent 也在下面，随时能点开。</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Link href="/chat" className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:-translate-y-0.5"><MessageSquare className="mb-3 h-5 w-5" /><p className="font-semibold">聊天</p><p className="mt-2 text-sm leading-6 text-muted-foreground">直接问答、改文字、翻译或发图讨论，不必先创建做图任务。</p></Link>
        <Link href="/compose" className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:-translate-y-0.5"><ImageIcon className="mb-3 h-5 w-5" /><p className="font-semibold">做一张图</p><p className="mt-2 text-sm leading-6 text-muted-foreground">主图框、产品图和参考图，加上一段说明，组合出一张图。</p></Link>
        <Link href="/set" className="rounded-2xl border border-border bg-white p-4 shadow-sm hover:-translate-y-0.5"><Images className="mb-3 h-5 w-5" /><p className="font-semibold">做一套图</p><p className="mt-2 text-sm leading-6 text-muted-foreground">为商品出一组主图或详情。先确认分镜和提示词，再一次生成。</p></Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Link href="/translate" className="rounded-2xl border border-border bg-white p-4 shadow-sm"><Languages className="mb-3 h-5 w-5" /><p className="font-semibold">译图</p><p className="mt-2 text-sm leading-6 text-muted-foreground">把已有主图或详情翻成泰语、印尼语或其他已开口的语言。</p></Link>
        <Link href="/agent" className="rounded-2xl border border-border bg-white p-4 shadow-sm"><Bot className="mb-3 h-5 w-5" /><p className="font-semibold">Agent</p><p className="mt-2 text-sm leading-6 text-muted-foreground">需要先确认计划再调用工具时使用。普通问题请走聊天。</p></Link>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold">最近聊天</h2>
          <div className="mt-3 space-y-2">{chats.length ? chats.map(chat => <Link key={chat.id} href={`/chat?session=${chat.id}`} className="block rounded-2xl border bg-white px-4 py-3 text-sm"><span className="font-medium">{chat.title}</span><span className="mt-1 block text-xs text-muted-foreground">{when(chat.updatedAt)}</span></Link>) : <p className="text-sm text-muted-foreground">还没有聊天。</p>}</div>
        </section>
        <section>
          <h2 className="text-sm font-semibold">最近任务</h2>
          <div className="mt-3 space-y-2">{tasks.length ? tasks.map(task => <Link key={task.href + task.title} href={task.href} className="block rounded-2xl border bg-white px-4 py-3 text-sm"><span className="font-medium">{task.title}</span><span className="mt-1 block text-xs text-muted-foreground">{task.meta}</span></Link>) : <p className="text-sm text-muted-foreground">还没有做图或译图任务。</p>}</div>
        </section>
      </div>
    </div>
  );
}
