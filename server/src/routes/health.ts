/**
 * Health: own status + optional aggregate upstream check.
 * NOTE the upstream path inconsistency (Risk #5): Klipy health lives at
 * /api/health, MyInstants health at /health — hardcode both explicitly.
 */
import { Elysia } from 'elysia';
import type { RoomStore } from '../store/interface';
import type { Config } from '../config';

async function ping(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function healthRoutes(store: RoomStore, config: Config) {
  return new Elysia().get('/health', async () => {
    const uptime = process.uptime();
    const base: Record<string, unknown> = {
      ok: true,
      store: store.kind,
      uptime,
      mockMedia: config.mockMedia,
    };

    if (!config.mockMedia) {
      const [klipy, myinstants] = await Promise.all([
        ping(`${config.klipyBaseUrl}/api/health`), // Klipy: /api/health
        ping(`${config.myinstantsBaseUrl}/health`), // MyInstants: /health (no /api)
      ]);
      base.upstream = { klipy, myinstants };
    }

    return base;
  });
}
