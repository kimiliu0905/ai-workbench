export const PRODUCT_NAME = "椰子酱电商工作台";
export const PRODUCT_TAGLINE = "本机商品图文工作台";
export const APP_ID = "com.yezijian.ecommerce-workbench";
export const USER_DATA_DIR_NAME = "椰子酱电商工作台";
export const DESKTOP_BIND_HOST = "127.0.0.1";
export const DEFAULT_LOCK_BASE_URL = "https://api.openai.com/v1";

export const DEFAULT_TEXT_MODEL = "gpt-6-luna";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.6-flare";

export const textModelOptions = ["gpt-6-luna", "gpt-6.2-sol", "gpt-6.1-terra"] as const;
export const imageModelOptions = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"] as const;

export const librarySourceLabels = {
  compose: "做一张图",
  set: "做一套图",
  translate: "译图",
  upload: "库内上传",
} as const;

export type LibrarySource = keyof typeof librarySourceLabels;

export const sizePresets = [
  { id: "1024x1024", width: 1024, height: 1024, label: "1024×1024" },
  { id: "1200x1200", width: 1200, height: 1200, label: "1200×1200" },
  { id: "1024x1536", width: 1024, height: 1536, label: "1024×1536" },
  { id: "1536x1024", width: 1536, height: 1024, label: "1536×1024" },
] as const;

export const referenceUseOptions = [
  { id: "frame", label: "放进主图框" },
  { id: "look", label: "参考画面" },
  { id: "custom", label: "自定义" },
] as const;
