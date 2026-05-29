import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { z } from 'zod';

const OracleEnv = z.object({
  GENLAYER_SERVICE_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  GENLAYER_ANALYSIS_ORACLE_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export function oracleConfigured(): boolean {
  return OracleEnv.safeParse(process.env).success;
}

function cfg() {
  const parsed = OracleEnv.parse(process.env);
  return {
    pk: parsed.GENLAYER_SERVICE_PRIVATE_KEY as `0x${string}`,
    address: parsed.GENLAYER_ANALYSIS_ORACLE_ADDRESS as `0x${string}`,
  };
}

let cachedClient: ReturnType<typeof createClient> | null = null;
function client() {
  if (cachedClient) return cachedClient;
  const account = createAccount(cfg().pk);
  cachedClient = createClient({ chain: studionet, account });
  return cachedClient;
}
function account() {
  return createAccount(cfg().pk);
}

export async function requestLlmAnalysis(
  matchId: string,
  engineSummary: string,
  pgn: string,
  timeoutMs = 5 * 60_000,
): Promise<string> {
  const c = client();
  const hash = (await c.writeContract({
    account: account(),
    address: cfg().address,
    functionName: 'request_analysis',
    args: [matchId, engineSummary, pgn],
  })) as `0x${string}`;

  await c.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    // LLM consensus is slow on Studio Net — give it space
    // (genlayer-js accepts these or falls back to defaults)
  } as any);

  // Read it back
  const rec = await c.readContract({
    address: cfg().address,
    functionName: 'get_analysis',
    args: [matchId],
  } as any);

  // The contract returns an AnalysisRecord — the SDK decodes to an object/dict.
  const raw = (rec as { raw_output?: string })?.raw_output ?? String(rec);
  return raw;
}

export async function analysisCompleted(matchId: string): Promise<boolean> {
  const c = client();
  const r = await c.readContract({
    address: cfg().address,
    functionName: 'analysis_completed',
    args: [matchId],
  } as any);
  return Boolean(r);
}
