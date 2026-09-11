/**
 * Store factory: Redis if REDIS_URL exists and pings, otherwise in-memory.
 */
import type { RoomStore } from './interface';
import { MemoryStore } from './memory';

export async function getStore(emptyGraceMs: number): Promise<RoomStore> {
  if (process.env.REDIS_URL?.trim()) {
    try {
      const { RedisStore } = await import('./redis');
      const store = await RedisStore.connect(process.env.REDIS_URL.trim());
      console.log('[store] using Redis store');
      return store; // ping succeeded
    } catch (err) {
      console.warn('[store] Redis unreachable — falling back to memory store:', (err as Error).message);
    }
  }
  return new MemoryStore(emptyGraceMs);
}
