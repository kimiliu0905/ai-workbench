export function resolveRequestApiKey(options: { serverKey?: string | null; explicit?: string | null; header?: string | null; desktop: boolean }) {
  const server = options.serverKey?.trim() || "";
  if (server) return server;
  if (options.desktop) return "";
  return options.explicit?.trim() || options.header?.trim() || "";
}
