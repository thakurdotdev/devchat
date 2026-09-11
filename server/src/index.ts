/**
 * DevChat server entrypoint — Elysia app + WS.
 * Bun + Elysia; store = Redis if REDIS_URL pings, else in-memory.
 */
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { loadConfig } from './config';
import { getStore } from './store';
import { healthRoutes } from './routes/health';
import { roomRoutes } from './routes/room';
import { mediaRoutes } from './routes/media';
import { wireWebSocket } from './ws/handler';

const config = loadConfig();
const store = await getStore(config.emptyGraceMs);

const app = new Elysia()
  .use(cors())
  .use(healthRoutes(store, config))
  .use(roomRoutes(store, config))
  .use(mediaRoutes(store, config));

wireWebSocket(app, store, config);

app.listen(config.port);

console.log(`🚀 DevChat server listening on :${config.port} (store=${store.kind}, mockMedia=${config.mockMedia})`);

export type App = typeof app;
