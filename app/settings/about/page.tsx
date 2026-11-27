import { ExternalLink, Github } from "lucide-react";
import packageInfo from "@/package.json";

const { version } = packageInfo;

export default function AboutPage() {
  return <div className="space-y-6"><div><p className="text-xs text-muted-foreground">应用信息</p><h1 className="mt-1 text-2xl font-semibold">关于椰子酱工作台</h1></div>
    <section className="rounded-3xl border border-border p-6 sm:p-8">
      <div className="flex items-center gap-4"><img src="/brand-icon.ico" alt="" className="h-16 w-16 rounded-2xl" /><div><h2 className="text-2xl font-semibold">椰子酱电商工作台</h2><p className="mt-1 text-sm text-muted-foreground">AI 商品图文工作台 · v{version}</p></div></div>
      <p className="mt-6 text-sm leading-7 text-muted-foreground">在本机保存聊天与做图记录，连接 OpenAI 聊天、看图及制作商品图。</p>
    </section>
    <section className="space-y-4 rounded-2xl border border-border p-6"><h2 className="font-semibold">品牌与版权信息</h2><p className="text-sm">灵矩绘境 · MxPage</p><p className="text-sm leading-6 text-muted-foreground">本应用基于灵矩绘境的 MxPage 改造，并按 MIT 许可保留原版权声明。</p><a href="https://github.com/kimiliu0905/ai-workbench" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent"><Github className="h-4 w-4" />项目 GitHub<ExternalLink className="h-3.5 w-3.5" /></a></section>
  </div>;
}
