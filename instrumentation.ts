export async function register() {
  if (process.env.NEXT_RUNTIME === "edge" || process.env.APP_RUNTIME !== "desktop") return;
  const { ensureDesktopDefaults } = await import("@/lib/workbench/settings");
  await ensureDesktopDefaults();
}
