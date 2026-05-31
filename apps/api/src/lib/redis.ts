import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export type RedisClient = InstanceType<typeof Redis>;

let client: RedisClient | undefined;

export function redis(): RedisClient {
  if (client) return client;
  client = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}
