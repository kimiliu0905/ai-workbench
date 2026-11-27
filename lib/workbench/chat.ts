import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "@/lib/db/prisma";
import { getWorkbenchSettings } from "@/lib/workbench/settings";
import { normalizeUpload, readWorkbenchImage, workbenchFilePath } from "./image-files";
import { openAIProblem, WorkbenchError, workbenchOpenAI } from "./openai";

const activeSessions = new Set<string>();

export async function listChatSessions() {
  return prisma.chatSession.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function createChatSession() {
  return prisma.chatSession.create({ data: {} });
}

export async function getChatSession(id: string) {
  return prisma.chatSession.findUnique({ where: { id }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
}

export async function changeChatSession(id: string, title: string | null) {
  if (activeSessions.has(id)) throw new WorkbenchError("请等待当前回复完成。", 409);
  if (title !== null) {
    const next = title.trim();
    if (!next || next.length > 80) throw new WorkbenchError("对话名称应为 1 到 80 个字符。");
    return prisma.chatSession.update({ where: { id }, data: { title: next } });
  }
  const session = await getChatSession(id);
  await prisma.chatSession.delete({ where: { id } });
  await Promise.allSettled((session?.messages || []).flatMap(({ imagePath }) => imagePath ? [fs.unlink(workbenchFilePath(imagePath))] : []));
}

export async function saveChatAttachment(buffer: Buffer, _mimeType?: string) {
  const bytes = await normalizeUpload(buffer, 1536);
  const relative = `chat/${randomUUID()}.png`;
  const absolute = workbenchFilePath(relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, bytes);
  return { relative, mimeType: "image/png" };
}

export async function streamChatMessage(sessionId: string, content: string, image?: Buffer) {
  const client = workbenchOpenAI(process.env.WORKBENCH_TEST_API_URL ? 4000 : 90000);
  const text = content.trim();
  if (!text && !image) throw new WorkbenchError("请输入消息或添加图片。");
  if (text.length > 20000) throw new WorkbenchError("单条消息最多 20000 个字符。");
  if (activeSessions.has(sessionId)) throw new WorkbenchError("这个对话正在等待回复。", 409);
  activeSessions.add(sessionId);

  try {
    const session = await getChatSession(sessionId);
    if (!session) throw new WorkbenchError("对话不存在。", 404);
    const { textModelId } = await getWorkbenchSettings();
    const attachment = image ? await saveChatAttachment(image) : undefined;
    const stored = await prisma.$transaction(async tx => {
      const message = await tx.chatMessage.create({ data: { sessionId, role: "user", content: text, imagePath: attachment?.relative } });
      await tx.chatSession.update({ where: { id: sessionId }, data: {
        updatedAt: new Date(),
        ...(session.messages.length === 0 && session.title === "新对话" ? { title: (text || "图片讨论").slice(0, 28) } : {}),
      } });
      return message;
    }).catch(async error => {
      if (attachment) await fs.unlink(workbenchFilePath(attachment.relative)).catch(() => {});
      throw error;
    });

    const abort = new AbortController();
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: object) => {
          if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          emit({ saved: stored });
          const history = [...session.messages.slice(-30), stored];
          const imageIds = new Set(history.filter(item => item.role === "user" && item.imagePath).slice(-4).map(item => item.id));
          const messages: ChatCompletionMessageParam[] = await Promise.all(history.map(async (item): Promise<ChatCompletionMessageParam> => {
            if (item.role === "assistant") return { role: "assistant", content: item.content };
            if (!item.imagePath || !imageIds.has(item.id)) return { role: "user", content: item.content || "［较早的图片］" };
            const { bytes, type } = await readWorkbenchImage(item.imagePath).catch(() => {
              throw new WorkbenchError("这段对话有一张原图无法读取。请在新对话重新上传。");
            });
            return { role: "user", content: [
              { type: "text", text: item.content || "请查看这张图。" },
              { type: "image_url", image_url: { url: `data:image/${type};base64,${bytes.toString("base64")}`, detail: "auto" } },
            ] };
          }));
          const stream = await client.chat.completions.create({
            model: textModelId, messages, stream: true, store: false, max_completion_tokens: 4096,
          }, { signal: abort.signal });
          let reply = "";
          for await (const part of stream) {
            const delta = part.choices[0]?.delta.content;
            if (!delta) continue;
            reply += delta;
            emit({ delta });
          }
          if (!reply.trim()) throw new WorkbenchError("OpenAI 没有返回文字，可以调整问题后再试。", 502);
          const result = await prisma.chatMessage.create({ data: { sessionId, role: "assistant", content: reply } });
          emit({ done: result });
        } catch (error) {
          emit({ error: openAIProblem(error).message });
        } finally {
          activeSessions.delete(sessionId);
          if (!abort.signal.aborted) controller.close();
        }
      },
      cancel() { abort.abort(); },
    });
  } catch (error) {
    activeSessions.delete(sessionId);
    throw error;
  }
}
