import fs from "node:fs/promises";
import sharp from "sharp";

export type PixelSize = { width: number; height: number };

const MAX_SIDE = 3840;
const MAX_PIXELS = 8_294_400;
const MIN_PIXELS_IMAGE_25 = 655_360;

export function image25MinPixels(modelId?: string) {
  return /gpt-image-2\.5/i.test(modelId || "");
}

export function isLegalImageSize(width: number, height: number, modelId?: string) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  if (width < 16 || height < 16 || width > MAX_SIDE || height > MAX_SIDE) return false;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (short <= 0 || long / short > 3) return false;
  if (width * height > MAX_PIXELS) return false;
  if (image25MinPixels(modelId) && width * height < MIN_PIXELS_IMAGE_25) return false;
  return true;
}

export function planImageSize(width: number, height: number, modelId?: string) {
  const target = { width, height };
  if (isLegalImageSize(width, height, modelId)) {
    return { target, requestWidth: width, requestHeight: height, legal: true, note: "" };
  }
  const ratio = width / Math.max(height, 1);
  let best: PixelSize | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let requestWidth = 16; requestWidth <= MAX_SIDE; requestWidth += 16) {
    const rawHeight = requestWidth / ratio;
    const candidates = [Math.round(rawHeight / 16) * 16, Math.floor(rawHeight / 16) * 16, Math.ceil(rawHeight / 16) * 16];
    for (const requestHeight of candidates) {
      if (!isLegalImageSize(requestWidth, requestHeight, modelId)) continue;
      const score = Math.abs(Math.log(requestWidth / width)) + Math.abs(Math.log(requestHeight / height)) + Math.abs(requestWidth / requestHeight - ratio);
      if (score < bestScore) {
        bestScore = score;
        best = { width: requestWidth, height: requestHeight };
      }
    }
  }
  const request = best ?? (image25MinPixels(modelId) ? { width: 1024, height: 1024 } : { width: 800, height: 800 });
  return {
    target,
    requestWidth: request.width,
    requestHeight: request.height,
    legal: false,
    note: `将先按 ${request.width}×${request.height} 生成，再等比缩放或居中裁切到 ${width}×${height}，不会拉伸。`,
  };
}

export function parsePixelSize(value?: string | null): PixelSize | null {
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(value || "");
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function readImageSize(buffer: Buffer): Promise<PixelSize> {
  const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error("无法读取图片尺寸。");
  return { width: meta.width, height: meta.height };
}

export async function finishImageToTarget(buffer: Buffer, target: PixelSize) {
  const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (meta.width === target.width && meta.height === target.height) return buffer;
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: target.width, height: target.height, fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

export async function lockImageFile(absolutePath: string, target: PixelSize) {
  const input = await fs.readFile(absolutePath);
  const output = await finishImageToTarget(input, target);
  if (output !== input) await fs.writeFile(absolutePath, output);
}
