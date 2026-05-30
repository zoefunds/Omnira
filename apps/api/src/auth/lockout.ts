import { redis } from '../lib/redis.js';

const MAX_FAILS = 5;
const WINDOW_SEC = 600;     // 10 min
const LOCK_SEC = 900;       // 15 min lockout once triggered

function failKey(identifier: string) { return `auth:fail:${identifier.toLowerCase()}`; }
function lockKey(identifier: string) { return `auth:lock:${identifier.toLowerCase()}`; }

export async function isLocked(identifier: string): Promise<number> {
  const ttl = await redis().ttl(lockKey(identifier));
  return ttl > 0 ? ttl : 0;
}

export async function recordFailure(identifier: string): Promise<{ locked: boolean; failsInWindow: number }> {
  const r = redis();
  const k = failKey(identifier);
  const fails = await r.incr(k);
  if (fails === 1) await r.expire(k, WINDOW_SEC);
  if (fails >= MAX_FAILS) {
    await r.set(lockKey(identifier), '1', 'EX', LOCK_SEC);
    await r.del(k);
    return { locked: true, failsInWindow: fails };
  }
  return { locked: false, failsInWindow: fails };
}

export async function clearFailures(identifier: string): Promise<void> {
  await redis().del(failKey(identifier), lockKey(identifier));
}
