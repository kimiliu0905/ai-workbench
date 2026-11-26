import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { getProviderAdapter } from "@/lib/services/provider-service";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import { librarySavePolicy } from "@/lib/workbench/library";

function storageRoot() {
  return path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
}

export async function listChatSessions() {
  return prisma.chatSession.findMany({ orderBy: { updatedAt: "desc" }, take: 50, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
}

export async function createChatSession() {
  return prisma.chatSession.create({ data: {} });
}

export async function getChatSession(id: string) {
  return prisma.chatSession.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
}

export async function saveChatAttachment(buffer: Buffer, mimeType: string) {
  if (librarySavePolicy("chat")) throw new Error("聊天图片不应进入素材库。");
  const relative = path.join("chat", `${randomUUID()}.png`);
  const absolute = path.join(storageRoot(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return { relative: relative.replaceAll("\\", "/"), mimeType };
}

export async function sendChatMessage(sessionId: string, content: string, image?: { buffer: Buffer; mimeType: string } | null) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!session) throw new Error("对话不存在。");
  const text = content.trim();
  if (!text && !image) throw new Error("请输入消息或添加图片。");
  const attachment = image ? await saveChatAttachment(image.buffer, image.mimeType) : null;
  await prisma.chatMessage.create({ data: { sessionId, role: "user", content: text, imagePath: attachment?.relative } });
  if (session.messages.length === 0) {
    await prisma.chatSession.update({ where: { id: sessionId }, data: { title: (text || "图片讨论").slice(0, 24) } });
  }
  const settings = await getWorkbenchSettings();
  const history = [...session.messages.map(message => `${message.role === "user" ? "用户" : "助手"}：${message.content}`), `用户：${text}`].join("\n");
  const imageUrl = attachment ? `data:${attachment.mimeType};base64,${image!.buffer.toString("base64")}` : undefined;
  const { adapter } = await getProviderAdapter();
  const result = await adapter.generateText({
    model: settings.textModelId,
    systemPrompt: "你是椰子酱电商工作台里的聊天助手。直接回答问题，可以改文字、翻译或讨论图片。不要要求用户先创建做图任务，也不要弹出工具审批。",
    userPrompt: history,
    images: imageUrl ? [imageUrl] : undefined,
    timeoutMs: 60000,
  });
  const reply = result.text?.trim() || "没有得到回复。";
  await prisma.chatMessage.create({ data: { sessionId, role: "assistant", content: reply } });
  await prisma.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
  return getChatSession(sessionId);
}
