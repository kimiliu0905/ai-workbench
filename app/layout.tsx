import type { Metadata } from "next";
import { ThemeToaster } from "@/components/layout/theme-toggle";

import "./globals.css";
import "@/components/editor/taobao-product-preview.css";

import { WorkbenchFrame } from "@/components/layout/workbench-frame";
import { WorkbenchPoller } from "@/components/layout/workbench-poller";
import { ProviderCredentialFetchBridge } from "@/components/layout/provider-credential-fetch-bridge";
import { ThemeScript } from "@/components/layout/theme-script";
import { BrandConsole } from "@/components/shared/brand-console";
import { ChunkReloadGuard } from "@/components/shared/chunk-reload-guard";
import { ImagePreviewProvider } from "@/components/shared/image-preview-provider";
import { productDescription, productTitle, publicSiteUrl } from "@/lib/seo";
import { ensureDesktopDefaults } from "@/lib/workbench/settings";

export const metadata: Metadata = {
  metadataBase: publicSiteUrl(),
  title: { default: productTitle, template: `%s · ${productTitle}` },
  applicationName: productTitle,
  keywords: ["MxPage", "AI电商详情页", "商品主图生成", "图片翻译", "小红书图文", "AI product images", "self-hosted"],
  authors: [{ name: "灵矩绘境", url: "https://github.com/ziguishian/MxPage" }],
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "zh_CN", siteName: productTitle, title: productTitle, description: productDescription },
  twitter: { card: "summary", title: productTitle, description: productDescription },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand-icon.ico",
  },
  description: productDescription,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (process.env.APP_RUNTIME === "desktop") await ensureDesktopDefaults();
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeScript />
        <ChunkReloadGuard />
        <BrandConsole />
        <ProviderCredentialFetchBridge />
        <WorkbenchPoller />
        <ImagePreviewProvider>
          <WorkbenchFrame>{children}</WorkbenchFrame>
        </ImagePreviewProvider>
        <ThemeToaster />
      </body>
    </html>
  );
}
