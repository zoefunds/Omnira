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

const INITIAL_WINDOW = 200;
const MAX_WINDOW = 1000;
const WINDOW_GROWTH_PER_SEC = 50;

function currentWindow(joinedAt: number, now: number): number {
  const ageSec = Math.max(0, (now - joinedAt) / 1000);
  return Math.min(MAX_WINDOW, INITIAL_WINDOW + ageSec * WINDOW_GROWTH_PER_SEC);
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

  // Find candidates within ±INITIAL_WINDOW of our rating
  const candidates = await r.zrangebyscore(
    key,
    entry.rating - INITIAL_WINDOW,
    entry.rating + INITIAL_WINDOW,
    'WITHSCORES',
  );

  // candidates is [userId1, score1, userId2, score2, ...]
  let best: { userId: string; rating: number } | null = null;
  for (let i = 0; i < candidates.length; i += 2) {
    const uid = candidates[i]!;
    const rating = parseInt(candidates[i + 1]!, 10);
    if (uid === entry.userId) continue;
    if (!best || Math.abs(rating - entry.rating) < Math.abs(best.rating - entry.rating)) {
      best = { userId: uid, rating };
    }
  }

  if (best) {
    const removed = await r.zrem(key, best.userId);
    if (removed === 1) {
      const metaRaw = await r.get(metaKey(best.userId));
      await r.del(metaKey(best.userId));
      if (metaRaw) {
        return JSON.parse(metaRaw) as QueueEntry;
      }
    }
    // race: someone else grabbed them. fall through and queue ourselves.
  }

  // No match found — add self to the queue
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

/** Background tick — try to pair up waiting players whose windows have grown. */
export async function tick(initialMs: number, incrementMs: number): Promise<Array<[QueueEntry, QueueEntry]>> {
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

  const pairs: Array<[QueueEntry, QueueEntry]> = [];
  const matched = new Set<string>();
  // Sort by rating, then greedily pair adjacent compatible players.
  entries.sort((a, b) => a.rating - b.rating);
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i]!;
    if (matched.has(a.userId)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]!;
      if (matched.has(b.userId)) continue;
      const window = Math.max(currentWindow(a.joinedAt, now), currentWindow(b.joinedAt, now));
      if (Math.abs(a.rating - b.rating) <= window) {
        matched.add(a.userId);
        matched.add(b.userId);
        await r.zrem(key, a.userId, b.userId);
        await r.del(metaKey(a.userId), metaKey(b.userId));
        pairs.push([a, b]);
        break;
      }
    }
  }
  return pairs;
}
