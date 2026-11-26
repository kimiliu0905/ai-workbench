export const productTitle = "椰子酱电商工作台";
export const productDescription = "装在这台 Windows 电脑上的电商图文工作台。基于 MxPage（MIT，灵矩绘境）改造，支持聊天、做一张图、做一套图、译图和 Agent。";

export function publicSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return undefined;
    return new URL(url.origin);
  } catch { return undefined; }
}
