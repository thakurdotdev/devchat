/**
 * Media proxy — CORS-safe gateway to Klipy (GIFs) + MyInstants (sounds).
 * Serves from local fixtures when MOCK_MEDIA=true; otherwise fetches the
 * upstream APIs, normalizes via adapters, and caches by `kind:q:page`
 * (identical searches across rooms share one cache entry).
 */
import { Elysia } from 'elysia';
import gifsFixture from '../data/fixtures/gifs.json';
import soundsFixture from '../data/fixtures/sounds.json';
import type { Config } from '../config';
import type { RoomStore } from '../store/interface';
import {
  adaptKlipyResponse,
  adaptMyInstantsResponse,
  type KlipyRawItem,
  type MyInstantsRawItem,
} from '../utils/adapters';

type CacheKind = 'gif-search' | 'gif-trending' | 'sound-search' | 'sound-trending';

async function cached(store: RoomStore, kind: CacheKind, key: string, ttlSec: number, produce: () => Promise<unknown>) {
  const cacheKey = `${kind}:${key}`;
  const hit = await store.cacheGet(cacheKey);
  if (hit) return JSON.parse(hit);
  const value = await produce();
  await store.cacheSet(cacheKey, JSON.stringify(value), ttlSec);
  return value;
}

function paginate<T>(items: T[], page: number, perPage = 24): T[] {
  const start = (Math.max(1, page) - 1) * perPage;
  return items.slice(start, start + perPage);
}

export function mediaRoutes(store: RoomStore, config: Config) {
  const app = new Elysia({ prefix: '/api/media' });

  // ---------------- GIFs (Klipy) ----------------

  app.get('/gifs/search', async ({ query }) => {
    const q = (query.q ?? '').trim();
    const page = Number(query.page ?? 1) || 1;
    if (!q) return { page, query: q, data: [] };
    const data = await cached(store, 'gif-search', `${q}:${page}`, config.gifCacheTtlSec, async () => {
      if (config.mockMedia) {
        const needle = q.toLowerCase();
        const all = gifsFixture as KlipyRawItem[];
        return adaptKlipyResponse({
          data: paginate(
            all.filter((g) => g.title.toLowerCase().includes(needle) || g.id.includes(needle)),
            page,
          ),
        });
      }
      const res = await fetch(`${config.klipyBaseUrl}/api/search?type=gifs&q=${encodeURIComponent(q)}&page=${page}`);
      return adaptKlipyResponse(await res.json());
    });
    return { page, query: q, data };
  });

  app.get('/gifs/trending', async ({ query }) => {
    const page = Number(query.page ?? 1) || 1;
    const data = await cached(store, 'gif-trending', `${page}`, config.gifCacheTtlSec, async () => {
      if (config.mockMedia) {
        return adaptKlipyResponse({ data: paginate(gifsFixture as KlipyRawItem[], page) });
      }
      const res = await fetch(`${config.klipyBaseUrl}/api/trending?type=gifs&page=${page}`);
      return adaptKlipyResponse(await res.json());
    });
    return { page, data };
  });

  // ---------------- Sounds (MyInstants) ----------------

  app.get('/sounds/search', async ({ query }) => {
    const q = (query.q ?? '').trim();
    const page = Number(query.page ?? 1) || 1;
    if (!q) return { page, query: q, data: [] };
    const data = await cached(store, 'sound-search', `${q}:${page}`, config.soundCacheTtlSec, async () => {
      if (config.mockMedia) {
        const needle = q.toLowerCase();
        const all = soundsFixture as MyInstantsRawItem[];
        return adaptMyInstantsResponse({
          data: paginate(
            all.filter((s) => s.name.toLowerCase().includes(needle) || s.id.includes(needle)),
            page,
          ),
        });
      }
      const res = await fetch(`${config.myinstantsBaseUrl}/api/search?q=${encodeURIComponent(q)}&page=${page}`);
      return adaptMyInstantsResponse(await res.json());
    });
    return { page, query: q, data };
  });

  app.get('/sounds/trending', async ({ query }) => {
    const page = Number(query.page ?? 1) || 1;
    const data = await cached(store, 'sound-trending', `${page}`, config.soundCacheTtlSec, async () => {
      if (config.mockMedia) {
        return adaptMyInstantsResponse({ data: paginate(soundsFixture as MyInstantsRawItem[], page) });
      }
      // MyInstants trending lives at /api/feed (not /api/trending)
      const res = await fetch(`${config.myinstantsBaseUrl}/api/feed?page=${page}`);
      return adaptMyInstantsResponse(await res.json());
    });
    return { page, data };
  });

  return app;
}
