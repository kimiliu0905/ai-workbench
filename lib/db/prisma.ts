import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function sqliteDatabaseUrl(raw = process.env.DATABASE_URL) {
  const url = raw?.trim() || "file:./dev.db";
  if (!/^file:|^sqlite:/i.test(url) || /[?&]socket_timeout=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}socket_timeout=60`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: sqliteDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: { maxWait: 20000, timeout: 30000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let sqliteWrite: Promise<unknown> = Promise.resolve();

// SQLite allows one writer. Overlapping interactive transactions take that lock
// and then wait on each other until the connector times out, so budget checks
// run one at a time and still account against the same run.
export function withSqliteWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = sqliteWrite.then(work, work);
  sqliteWrite = run.then(() => undefined, () => undefined);
  return run;
}
