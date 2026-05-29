import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
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
function svcAccount() {
  return createAccount(cfg().pk);
}

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 30, comp: 'worker/onchain', msg, ...extra }));
}

async function isCompleted(matchId: string): Promise<boolean> {
  try {
    const r = await client().readContract({
      address: cfg().address,
      functionName: 'analysis_completed',
      args: [matchId],
      stateStatus: 'accepted',
    } as any);
    return Boolean(r);
  } catch {
    return false;
  }
}

async function readAnalysis(matchId: string): Promise<string> {
  const rec: any = await client().readContract({
    address: cfg().address,
    functionName: 'get_analysis',
    args: [matchId],
    stateStatus: 'accepted',
  } as any);

  // The SDK may decode the dataclass as an object, a tuple, or a numeric-keyed map.
  // Field order in AnalysisRecord: requester, requested_at, completed_at, raw_output, completed
  if (typeof rec === 'string') return rec;
  if (rec && typeof rec.raw_output === 'string') return rec.raw_output;
  if (Array.isArray(rec) && typeof rec[3] === 'string') return rec[3];
  if (rec && typeof rec === 'object') {
    // numeric-keyed (`rec['3']`) form
    if (typeof rec['3'] === 'string') return rec['3'];
    // last-resort: pick the longest string value — raw_output dwarfs the rest
    const longest = Object.values(rec)
      .filter((v): v is string => typeof v === 'string')
      .sort((a, b) => b.length - a.length)[0];
    if (longest) return longest;
  }
  return JSON.stringify(rec);
}

/**
 * Submit the LLM analysis request and poll the contract until it reports completion.
 *
 * We deliberately do NOT use waitForTransactionReceipt:
 *  - its timeout is short and not cleanly tunable in genlayer-js@1.1.x
 *  - LLM consensus rounds on Studio Net routinely take 2-5 minutes
 *  - the contract has a perfect `analysis_completed` view that's the ground truth
 */
export async function requestLlmAnalysis(
  matchId: string,
  engineSummary: string,
  pgn: string,
  totalTimeoutMs = 12 * 60_000,
  pollIntervalMs = 10_000,
): Promise<string> {
  // If we've already done this (idempotent contract), short-circuit.
  if (await isCompleted(matchId)) {
    log('already completed onchain — short-circuiting', { matchId });
    return readAnalysis(matchId);
  }

  log('submitting request_analysis tx', { matchId });
  const hash = (await client().writeContract({
    account: svcAccount(),
    address: cfg().address,
    functionName: 'request_analysis',
    args: [matchId, engineSummary, pgn],
  })) as `0x${string}`;
  log('tx submitted; polling for completion', { matchId, hash });

  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < totalTimeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    attempts += 1;
    const done = await isCompleted(matchId);
    if (done) {
      log('completed', { matchId, attempts, waitedMs: Date.now() - start });
      return readAnalysis(matchId);
    }
    if (attempts % 6 === 0) {
      log('still waiting…', { matchId, attempts, waitedMs: Date.now() - start });
    }
  }
  throw new Error(`LLM analysis not completed within ${totalTimeoutMs}ms`);
}
