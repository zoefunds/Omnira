import { redis } from '../lib/redis.js';

export interface QueueEntry {
  userId: string;
  rating: number;
  initialMs: number;
  incrementMs: number;
  joinedAt: number;
}

function bucketKey(initialMs: number, incrementMs: number): string {
  return `mm:queue:${initialMs}:${incrementMs}`;
}
function metaKey(userId: string): string {
  return `mm:meta:${userId}`;
}
function lastOppKey(userId: string, initialMs: number, incrementMs: number): string {
  return `mm:last:${userId}:${initialMs}:${incrementMs}`;
}

const INITIAL_WINDOW = 200;
const MAX_WINDOW = 1000;
const WINDOW_GROWTH_PER_SEC = 50;
/**
 * After waiting longer than this, we drop the no-rematch preference. Avoids
 * two players sitting in an empty bucket forever refusing to play each other.
 */
const REMATCH_FALLBACK_MS = 10_000;
/** TTL on the last-opponent memory. Comfortably longer than a typical bullet
 *  + a few re-queue cycles. */
const LAST_OPP_TTL_SEC = 30 * 60;

function currentWindow(joinedAt: number, now: number): number {
  const ageSec = Math.max(0, (now - joinedAt) / 1000);
  return Math.min(MAX_WINDOW, INITIAL_WINDOW + ageSec * WINDOW_GROWTH_PER_SEC);
}

/** Record that `a` and `b` just played each other in this bucket. */
async function rememberOpponents(
  a: string,
  b: string,
  initialMs: number,
  incrementMs: number,
): Promise<void> {
  const r = redis();
  await Promise.all([
    r.set(lastOppKey(a, initialMs, incrementMs), b, 'EX', LAST_OPP_TTL_SEC),
    r.set(lastOppKey(b, initialMs, incrementMs), a, 'EX', LAST_OPP_TTL_SEC),
  ]);
}

async function getLastOpponent(
  userId: string,
  initialMs: number,
  incrementMs: number,
): Promise<string | null> {
  return redis().get(lastOppKey(userId, initialMs, incrementMs));
}

/**
 * Try to pair `entry` with someone already waiting in the same bucket.
 * Returns the opponent if matched (both have been removed from the queue),
 * or null if the entry was added to the queue to wait.
 */
export async function joinOrMatch(entry: QueueEntry): Promise<QueueEntry | null> {
  const r = redis();
  const key = bucketKey(entry.initialMs, entry.incrementMs);
  const now = Date.now();

  // Find candidates within ±INITIAL_WINDOW of our rating.
  const candidates = await r.zrangebyscore(
    key,
    entry.rating - INITIAL_WINDOW,
    entry.rating + INITIAL_WINDOW,
    'WITHSCORES',
  );

  // Parse into a usable list, skipping self.
  const list: Array<{ userId: string; rating: number }> = [];
  for (let i = 0; i < candidates.length; i += 2) {
    const uid = candidates[i]!;
    if (uid === entry.userId) continue;
    list.push({ userId: uid, rating: parseInt(candidates[i + 1]!, 10) });
  }

  // Anti-rematch: walk candidates by rating-distance, prefer ones that AREN'T
  // our most recent opponent. Only fall back to the same opponent if either:
  //  - they're the only option, AND
  //  - they've been waiting > REMATCH_FALLBACK_MS, OR we have no other choice.
  const lastOpp = await getLastOpponent(entry.userId, entry.initialMs, entry.incrementMs);
  list.sort((a, b) => Math.abs(a.rating - entry.rating) - Math.abs(b.rating - entry.rating));

  let pick: { userId: string; rating: number } | null = null;
  let rematchPick: { userId: string; rating: number } | null = null;
  for (const c of list) {
    if (lastOpp && c.userId === lastOpp) {
      if (!rematchPick) rematchPick = c;
      continue;
    }
    pick = c;
    break;
  }
  if (!pick && rematchPick) {
    // Only accept the rematch if the waiter has been there long enough.
    const metaRaw = await r.get(metaKey(rematchPick.userId));
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as QueueEntry;
      if (now - meta.joinedAt >= REMATCH_FALLBACK_MS) pick = rematchPick;
    } else {
      // Stale entry without meta — safer to skip.
    }
  }

  if (pick) {
    const removed = await r.zrem(key, pick.userId);
    if (removed === 1) {
      const metaRaw = await r.get(metaKey(pick.userId));
      await r.del(metaKey(pick.userId));
      if (metaRaw) {
        const opponent = JSON.parse(metaRaw) as QueueEntry;
        await rememberOpponents(entry.userId, opponent.userId, entry.initialMs, entry.incrementMs);
        return opponent;
      }
    }
    // Race: someone else grabbed them. Fall through and queue ourselves.
  }

  // No match found — add self to the queue.
  await r.zadd(key, entry.rating, entry.userId);
  await r.set(metaKey(entry.userId), JSON.stringify(entry), 'EX', 600);
  return null;
}

export async function leaveQueue(
  userId: string,
  initialMs: number,
  incrementMs: number,
): Promise<void> {
  const r = redis();
  await r.zrem(bucketKey(initialMs, incrementMs), userId);
  await r.del(metaKey(userId));
}

/** Background tick — try to pair up waiting players whose windows have grown.
 *  Same anti-rematch policy as `joinOrMatch`. */
export async function tick(
  initialMs: number,
  incrementMs: number,
): Promise<Array<[QueueEntry, QueueEntry]>> {
  const r = redis();
  const key = bucketKey(initialMs, incrementMs);
  const now = Date.now();
  const all = await r.zrange(key, 0, -1, 'WITHSCORES');

  const entries: QueueEntry[] = [];
  for (let i = 0; i < all.length; i += 2) {
    const uid = all[i]!;
    const raw = await r.get(metaKey(uid));
    if (raw) entries.push(JSON.parse(raw) as QueueEntry);
  }

  // Pre-fetch each player's last opponent in this bucket in one batch.
  const lastOpp = new Map<string, string | null>();
  await Promise.all(
    entries.map(async (e) => {
      lastOpp.set(e.userId, await getLastOpponent(e.userId, initialMs, incrementMs));
    }),
  );

  const pairs: Array<[QueueEntry, QueueEntry]> = [];
  const matched = new Set<string>();
  entries.sort((a, b) => a.rating - b.rating);
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i]!;
    if (matched.has(a.userId)) continue;
    let rematchIdx = -1;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]!;
      if (matched.has(b.userId)) continue;
      const window = Math.max(currentWindow(a.joinedAt, now), currentWindow(b.joinedAt, now));
      if (Math.abs(a.rating - b.rating) > window) continue;
      if (lastOpp.get(a.userId) === b.userId || lastOpp.get(b.userId) === a.userId) {
        if (rematchIdx === -1) rematchIdx = j;
        continue;
      }
      matched.add(a.userId);
      matched.add(b.userId);
      await r.zrem(key, a.userId, b.userId);
      await r.del(metaKey(a.userId), metaKey(b.userId));
      pairs.push([a, b]);
      await rememberOpponents(a.userId, b.userId, initialMs, incrementMs);
      break;
    }
    // If we couldn't find a non-rematch within window, fall back if the
    // candidate has been waiting long enough.
    if (rematchIdx !== -1 && !matched.has(a.userId)) {
      const b = entries[rematchIdx]!;
      const longestWait = Math.max(now - a.joinedAt, now - b.joinedAt);
      if (longestWait >= REMATCH_FALLBACK_MS) {
        matched.add(a.userId);
        matched.add(b.userId);
        await r.zrem(key, a.userId, b.userId);
        await r.del(metaKey(a.userId), metaKey(b.userId));
        pairs.push([a, b]);
        await rememberOpponents(a.userId, b.userId, initialMs, incrementMs);
      }
    }
  }
  return pairs;
}
