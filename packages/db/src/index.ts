import { PrismaClient } from '@prisma/client';

// Singleton pattern — prevents connection storms in dev (HMR) and serverless.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Build a DATABASE_URL with sensible defaults for connection-pool sizing.
 * - `connection_limit`: bump from Prisma's default (≈ 1 + 2× CPU) to handle
 *   200-300 concurrent users plus the worker. Postgres' own `max_connections`
 *   defaults to 100 on Railway, so we stay well under that across api+worker.
 * - `pool_timeout`: don't fail-fast — wait briefly for a free slot when the
 *   pool is busy under bursty load.
 */
function tunedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '20');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '15');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: tunedDatabaseUrl() ?? process.env.DATABASE_URL! } },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
