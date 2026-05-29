import Redis from 'ioredis';
import { env } from '../config/env.js';

let client: Redis | undefined;

export function redis(): Redis {
  if (client) return client;
  client = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}
