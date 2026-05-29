import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  STOCKFISH_PATH: z.string().default('/opt/homebrew/bin/stockfish'),
  ANALYSIS_DEPTH: z.coerce.number().int().min(6).max(22).default(12),
  ANALYSIS_POLL_MS: z.coerce.number().int().min(500).default(3_000),
});

export type Env = z.infer<typeof Schema>;
let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('worker env invalid:', parsed.error.flatten().fieldErrors);
    throw new Error('env invalid');
  }
  cached = parsed.data;
  return cached;
}
