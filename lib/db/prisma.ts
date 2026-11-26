import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function withSqliteParam(url: string, key: string, value: string) {
  if (new RegExp(`[?&]${key}=`).test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

export function sqliteDatabaseUrl(raw = process.env.DATABASE_URL) {
  const url = raw?.trim() || "file:./dev.db";
  if (!/^file:|^sqlite:/i.test(url)) return url;
  // One connection avoids cross-connection SQLite lock waits. Parallel interactive
  // transactions were holding shared locks until the 60s socket timeout.
  return withSqliteParam(withSqliteParam(url, "socket_timeout", "60"), "connection_limit", "1");
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
