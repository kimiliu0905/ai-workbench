"use client";

import { useEffect } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { defaultProfile, profileSchema, readProfile, type UserProfile } from "@/lib/profile";

const profileStore = createStore(() => ({ profile: defaultProfile, loaded: false }));

function hydrate() {
  fetch("/api/workbench/profile").then(response => response.json()).then(payload => {
    profileStore.setState({ profile: payload?.data ? readProfile(JSON.stringify(payload.data)) : defaultProfile, loaded: true });
  }).catch(() => profileStore.setState({ loaded: true }));
}

export function useProfile() {
  const state = useStore(profileStore);
  useEffect(() => {
    if (!profileStore.getState().loaded) hydrate();
  }, []);
  return state;
}

export async function saveProfile(profile: UserProfile) {
  const valid = profileSchema.parse(profile);
  const response = await fetch("/api/workbench/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || "保存失败，请检查这台电脑是否允许本地保存。");
  profileStore.setState({ profile: valid, loaded: true });
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("请选择 PNG、JPG、WebP 或 GIF 图片");
  if (file.size > 5 * 1024 * 1024) throw new Error("头像原图不能超过 5 MB");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error("图片尺寸过大，请选择较小的头像");
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("这台电脑暂时无法处理头像图片");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/webp", 0.85);
  } finally { bitmap.close(); }
}
