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
import { clientIp } from '../utils/clientIp';
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
  async function allowMedia(request: Request, server: unknown, set: { status?: any; headers: any }) {
    const quota = await store.consumeRateLimit(`media:${clientIp(request, server, config.trustProxy)}`, config.mediaRatePerMinute, 60_000);
    if (quota.allowed) return true;
    set.status = 429;
    set.headers['retry-after'] = String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000)));
    return false;
  }
  function validQuery(q: string, page: number, set: { status?: any }) {
    if (q.length > 100 || !Number.isInteger(page) || page < 1 || page > 100) {
      set.status = 400;
      return false;
    }
    return true;
  }

  // ---------------- GIFs (Klipy) ----------------

  app.get('/gifs/search', async ({ query, request, server, set }) => {
    const q = (query.q ?? '').trim();
    const page = Number(query.page ?? 1) || 1;
    if (!validQuery(q, page, set)) return { error: 'INVALID_QUERY', message: 'Search text must be 100 characters or fewer and page must be from 1 to 100.' };
    if (!await allowMedia(request, server, set)) return { error: 'RATE_LIMITED', message: 'Media search is temporarily limited. Please wait a moment.' };
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
      try {
        const res = await fetch(`${config.klipyBaseUrl}/api/search?type=gifs&q=${encodeURIComponent(q)}&page=${page}`);
        if (!res.ok) throw new Error(`Klipy search error HTTP ${res.status}`);
        return adaptKlipyResponse(await res.json());
      } catch (err) {
        console.error('Klipy search error, falling back to fixtures:', err);
        const needle = q.toLowerCase();
        const all = gifsFixture as KlipyRawItem[];
        return adaptKlipyResponse({
          data: paginate(
            all.filter((g) => g.title.toLowerCase().includes(needle) || g.id.includes(needle)),
            page,
          ),
        });
      }
    });
    return { page, query: q, data };
  });

  app.get('/gifs/trending', async ({ query, request, server, set }) => {
    const page = Number(query.page ?? 1) || 1;
    if (!validQuery('', page, set)) return { error: 'INVALID_QUERY', message: 'Page must be from 1 to 100.' };
    if (!await allowMedia(request, server, set)) return { error: 'RATE_LIMITED', message: 'Media search is temporarily limited. Please wait a moment.' };
    const data = await cached(store, 'gif-trending', `${page}`, config.gifCacheTtlSec, async () => {
      if (config.mockMedia) {
        return adaptKlipyResponse({ data: paginate(gifsFixture as KlipyRawItem[], page) });
      }
      try {
        const res = await fetch(`${config.klipyBaseUrl}/api/trending?type=gifs&page=${page}`);
        if (!res.ok) throw new Error(`Klipy trending error HTTP ${res.status}`);
        return adaptKlipyResponse(await res.json());
      } catch (err) {
        console.error('Klipy trending error, falling back to fixtures:', err);
        return adaptKlipyResponse({ data: paginate(gifsFixture as KlipyRawItem[], page) });
      }
    });
    return { page, data };
  });

  // ---------------- Sounds (MyInstants) ----------------

  app.get('/sounds/search', async ({ query, request, server, set }) => {
    const q = (query.q ?? '').trim();
    const page = Number(query.page ?? 1) || 1;
    if (!validQuery(q, page, set)) return { error: 'INVALID_QUERY', message: 'Search text must be 100 characters or fewer and page must be from 1 to 100.' };
    if (!await allowMedia(request, server, set)) return { error: 'RATE_LIMITED', message: 'Media search is temporarily limited. Please wait a moment.' };
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
      try {
        const res = await fetch(`${config.myinstantsBaseUrl}/api/search?q=${encodeURIComponent(q)}&page=${page}`);
        if (!res.ok) throw new Error(`MyInstants search error HTTP ${res.status}`);
        return adaptMyInstantsResponse(await res.json());
      } catch (err) {
        console.error('MyInstants search error, falling back to fixtures:', err);
        const needle = q.toLowerCase();
        const all = soundsFixture as MyInstantsRawItem[];
        return adaptMyInstantsResponse({
          data: paginate(
            all.filter((s) => s.name.toLowerCase().includes(needle) || s.id.includes(needle)),
            page,
          ),
        });
      }
    });
    return { page, query: q, data };
  });

  app.get('/sounds/trending', async ({ query, request, server, set }) => {
    const page = Number(query.page ?? 1) || 1;
    if (!validQuery('', page, set)) return { error: 'INVALID_QUERY', message: 'Page must be from 1 to 100.' };
    if (!await allowMedia(request, server, set)) return { error: 'RATE_LIMITED', message: 'Media search is temporarily limited. Please wait a moment.' };
    const data = await cached(store, 'sound-trending', `${page}`, config.soundCacheTtlSec, async () => {
      if (config.mockMedia) {
        return adaptMyInstantsResponse({ data: paginate(soundsFixture as MyInstantsRawItem[], page) });
      }
      try {
        const res = await fetch(`${config.myinstantsBaseUrl}/api/feed?page=${page}`);
        if (!res.ok) throw new Error(`MyInstants feed error HTTP ${res.status}`);
        return adaptMyInstantsResponse(await res.json());
      } catch (err) {
        console.error('MyInstants feed error, falling back to fixtures:', err);
        return adaptMyInstantsResponse({ data: paginate(soundsFixture as MyInstantsRawItem[], page) });
      }
    });
    return { page, data };
  });

  return app;
}
