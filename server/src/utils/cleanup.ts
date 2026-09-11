/**
 * TTL sweeper for the in-memory store.
 * (The RedisStore relies on Redis-native key expiry instead.)
 */
import type { MemoryStore } from '../store/memory';

export function startCleanupSweeper(store: MemoryStore, intervalMs = 30_000) {
  // MemoryStore already runs its own interval sweeper; this exists for
  // future stores/strategies and as an explicit lifecycle hook.
  return {
    stop() {
      store.stop();
    },
  };
}
