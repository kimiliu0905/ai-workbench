export const contentLanguageOptions = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "es-ES",
  "fr-FR",
  "de-DE",
  "pt-PT",
  "ar-SA",
  "ru-RU",
  "th-TH",
  "id-ID",
] as const;

export type ContentLanguage = (typeof contentLanguageOptions)[number];

export const contentLanguageLabels: Record<ContentLanguage, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
  "es-ES": "Español",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "pt-PT": "Português",
  "ar-SA": "العربية",
  "ru-RU": "Русский",
  "th-TH": "ไทย 泰语",
  "id-ID": "Bahasa Indonesia 印尼语",
};

export const contentLanguageNamesForPrompt: Record<ContentLanguage, string> = {
  "zh-CN": "Simplified Chinese",
  "en-US": "English",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "es-ES": "Spanish",
  "fr-FR": "French",
  "de-DE": "German",
  "pt-PT": "Portuguese",
  "ar-SA": "Arabic",
  "ru-RU": "Russian",
  "th-TH": "Thai",
  "id-ID": "Indonesian",
};

export function normalizeContentLanguage(value: unknown): ContentLanguage {
  if (typeof value === "string" && (contentLanguageOptions as readonly string[]).includes(value)) {
    return value as ContentLanguage;
  }

  return "zh-CN";
}