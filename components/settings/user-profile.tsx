"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil, RefreshCw, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/profile";
import { prepareAvatar, saveProfile, useProfile } from "./profile-store";

export function UserAvatar({ profile, className }: { profile: UserProfile; className?: string }) {
  return <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-muted-foreground", className)}>
    {profile.avatar ? <img src={profile.avatar} alt={`${profile.name}的头像`} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-1/2 w-1/2" />}
  </span>;
}

function ProfileEditor() {
  const { profile, loaded } = useProfile();
  const [draft, setDraft] = useState(profile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog.Root open={open} onOpenChange={value => { if (busy) return; if (value) { setDraft(profile); setError(""); } setOpen(value); }}>
    <Dialog.Trigger asChild><Button variant="outline" disabled={!loaded} className="gap-2"><Pencil className="h-3.5 w-3.5" />编辑资料</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] max-h-[90vh] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-xl">
        <Dialog.Title className="text-xl font-semibold">编辑个人资料</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">头像和名称保存在这台电脑上，供这台工作台使用。</Dialog.Description>
        <form className="mt-6 space-y-5" onSubmit={event => {
          event.preventDefault(); setError("");
          try { saveProfile(draft); setOpen(false); toast.success("个人资料已保存"); }
          catch (cause) { setError((cause as { issues?: Array<{ message: string }> }).issues?.[0]?.message || "保存失败，请检查这台电脑是否允许本地保存。"); }
        }}>
          <div className="flex items-center gap-4">
            <UserAvatar profile={draft} className="h-20 w-20" />
            <div className="space-y-2">
              <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring", busy && "pointer-events-none opacity-50")}>
                <Camera aria-hidden="true" className="h-4 w-4" />{busy ? "处理图片中…" : "上传头像"}
                <input aria-label="上传头像" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={busy} onChange={async event => {
                  const file = event.target.files?.[0]; event.target.value = "";
                  if (!file) return;
                  setBusy(true); setError("");
                  try { const avatar = await prepareAvatar(file); setDraft(current => ({ ...current, avatar })); }
                  catch (cause) { setError(cause instanceof Error ? cause.message : "图片无法读取，请换一张图片"); }
                  finally { setBusy(false); }
                }} />
              </label>
              {draft.avatar && <button type="button" disabled={busy} onClick={() => setDraft(current => ({ ...current, avatar: null }))} className="ml-3 text-xs text-muted-foreground underline">移除头像</button>}
              <p className="text-xs text-muted-foreground">最大 5 MB，居中裁切为圆形头像。</p>
            </div>
          </div>
          <label className="block space-y-2 text-sm">显示名称<Input aria-label="显示名称" value={draft.name} maxLength={40} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="block space-y-2 text-sm">用户名<Input aria-label="用户名" value={draft.username} maxLength={30} autoCapitalize="none" onChange={event => setDraft({ ...draft, username: event.target.value })} /><span className="block text-xs text-muted-foreground">2–30 位字母、数字、点、下划线或短横线。</span></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Dialog.Close asChild><Button type="button" variant="outline" disabled={busy}>取消</Button></Dialog.Close><Button disabled={busy} type="submit">保存资料</Button></div>
        </form>
        <Dialog.Close aria-label="关闭资料编辑" disabled={busy} className="absolute right-5 top-5 rounded-lg p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function UserProfilePage() {
  const { profile } = useProfile();
  const router = useRouter();
  const [pending, transition] = useTransition();
  return <div className="space-y-8">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">个人资料</p><h1 className="mt-1 text-2xl font-semibold">用户中心</h1></div><Button variant="ghost" size="sm" disabled={pending} onClick={() => transition(() => router.refresh())} className="gap-2 text-xs text-muted-foreground"><RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5", pending && "animate-spin")} />刷新记录</Button></div>
    <div className="flex flex-col items-center py-3 text-center">
      <UserAvatar profile={profile} className="h-24 w-24" />
      <h2 className="mt-4 max-w-full break-words text-2xl font-semibold">{profile.name}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">@{profile.username}</p>
      <ProfileEditor />
    </div>
    <p className="text-xs text-muted-foreground">头像和名称保存在这台电脑上，和这台工作台的其他数据在一起。</p>
  </div>;
}
