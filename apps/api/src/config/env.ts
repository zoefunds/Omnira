import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(64),
  JWT_TTL: z.string().default('7d'),

  WALLET_MASTER_SECRET: z.string().min(64),
  WALLET_DERIVATION_VERSION: z.string().default('v1'),

  GENLAYER_RPC_URL: z.string().url(),
  GENLAYER_CHAIN_ID: z.string().optional(),
  GENLAYER_MATCH_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  GENLAYER_TOURNAMENT_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  GENLAYER_SERVICE_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  ADMIN_TOKEN: z.string().min(32).optional(),

  // Password reset email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Omnira <onboarding@resend.dev>'),
  WEB_BASE_URL: z.string().url().default('https://omnira-blond.vercel.app'),
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

export function __resetEnvCache(): void {
  cached = undefined;
}

/** True iff the API can talk to the chain. */
export function onchainEnabled(): boolean {
  const e = env();
  return !!(e.GENLAYER_MATCH_REGISTRY_ADDRESS && e.GENLAYER_SERVICE_PRIVATE_KEY);
}
