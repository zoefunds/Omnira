import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be ≥ 64 chars'),
  JWT_TTL: z.string().default('7d'),

  WALLET_MASTER_SECRET: z
    .string()
    .min(64, 'WALLET_MASTER_SECRET must be ≥ 64 chars (use openssl rand -hex 64)'),
  WALLET_DERIVATION_VERSION: z.string().default('v1'),

  GENLAYER_RPC_URL: z.string().url(),
  GENLAYER_CHAIN_ID: z.string().optional(),
  GENLAYER_MATCH_REGISTRY_ADDRESS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  cached = parsed.data;
  return cached;
}

/** Test-only — re-read env vars on next call. */
export function __resetEnvCache(): void {
  cached = undefined;
}
