import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { prepareAvatar } from "../components/settings/profile-store";
import { profileSchema } from "../lib/profile";

test("profile save no longer uses browser localStorage", async () => {
  const source = await readFile("components/settings/profile-store.ts", "utf8");
  assert.doesNotMatch(source, /localStorage|mxpage:profile/);
  assert.match(source, /\/api\/workbench\/profile/);
  assert.equal(profileSchema.safeParse({ name: " ", username: "yezijian", avatar: null }).success, false);
});

test("avatars reject unsupported and oversized files before decoding", async () => {
  await assert.rejects(prepareAvatar(new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" })), /PNG/);
  await assert.rejects(prepareAvatar(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })), /5 MB/);
});

test("avatar processing crops a wide image centrally, bounds output and releases decoded pixels", async () => {
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  let released = 0;
  let dimensions: number[] = [];
  const bitmap = { width: 800, height: 400, close() { released++; } };
  const canvas = { width: 0, height: 0,
    getContext() { return { drawImage(_source: unknown, ...args: number[]) { dimensions = args; } }; },
    toDataURL() { return "data:image/webp;base64,YQ=="; },
  };
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => bitmap });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement() { return canvas; } } });
  try {
    assert.equal(await prepareAvatar(new File(["sample"], "avatar.png", { type: "image/png" })), "data:image/webp;base64,YQ==");
    assert.deepEqual(dimensions, [200, 0, 400, 400, 0, 0, 256, 256]);
    assert.equal(canvas.width, 256); assert.equal(canvas.height, 256); assert.equal(released, 1);
    bitmap.width = 100_000;
    bitmap.height = 100_000;
    await assert.rejects(prepareAvatar(new File(["sample"], "avatar.png", { type: "image/png" })), /尺寸过大/);
    assert.equal(released, 2);
  } finally {
    for (const [key, descriptor] of [["createImageBitmap", bitmapDescriptor], ["document", documentDescriptor]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
