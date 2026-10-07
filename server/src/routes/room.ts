/** REST: create room / room info. */
import { Elysia } from 'elysia';
import type { RoomStore } from '../store/interface';
import { newHostSecret, newRoomCode } from '../utils/ids';
import type { Config } from '../config';
import { clientIp } from '../utils/clientIp';

export function roomRoutes(store: RoomStore, config: Config) {
  return new Elysia({ prefix: '/api/rooms' })
    .get('/policy', () => ({
      defaultTtlHours: config.defaultRoomTtlHours,
      maxTtlHours: config.maxRoomTtlHours,
      durable: store.kind === 'redis',
    }))
    .post('/', async ({ body, set, request, server }) => {
      const bodyValue = body as { ttlHours?: unknown; name?: unknown } | null;
      if (bodyValue?.name !== undefined && typeof bodyValue.name !== 'string') {
        set.status = 400;
        return { error: 'INVALID_NAME', message: 'Room name must be text.' };
      }
      const name = typeof bodyValue?.name === 'string' ? bodyValue.name.trim() : '';
      if (name.length > 48 || /[\u0000-\u001f\u007f]/.test(name)) {
        set.status = 400;
        return { error: 'INVALID_NAME', message: 'Room names must be 48 characters or fewer.' };
      }
      const ttlHours = bodyValue?.ttlHours === undefined
        ? config.defaultRoomTtlHours
        : Number(bodyValue.ttlHours);
      if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > config.maxRoomTtlHours) {
        set.status = 400;
        return {
          error: 'INVALID_DURATION',
          message: `Room duration must be a whole number of hours from 1 to ${config.maxRoomTtlHours}.`,
          maxTtlHours: config.maxRoomTtlHours,
        };
      }
      const quota = await store.consumeRateLimit(`create:${clientIp(request, server, config.trustProxy)}`, config.createRatePerHour, 60 * 60_000);
      if (!quota.allowed) {
        set.status = 429;
        set.headers['retry-after'] = String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000)));
        return { error: 'RATE_LIMITED', message: 'Too many rooms created from this network. Please try again later.' };
      }

      // createRoom() generates the timestamps; we assign the code + secret
      // and persist, retrying on the (astronomically unlikely) code clash.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const hostSecret = newHostSecret();
        const base = await store.createRoom({ ttlMs: ttlHours * 3_600_000, hostSecret, name: name || undefined });
        const room = { ...base, code };
        if (await store.getRoom(code)) continue; // collision — retry
        await store.saveRoom({ ...room, hostSecret });
        return {
          code: room.code,
          name: room.name ?? '',
          expiresAt: room.expiresAt,
          ttlHours,
          durable: store.kind === 'redis',
          url: '/ws',
        };
      }
      throw new Error('could not allocate room code');
    })
    .get('/:code', async ({ params, set, request, server }) => {
      const quota = await store.consumeRateLimit(`lookup:${clientIp(request, server, config.trustProxy)}`, config.lookupRatePerMinute, 60_000);
      if (!quota.allowed) {
        set.status = 429;
        set.headers['retry-after'] = String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000)));
        return { error: 'RATE_LIMITED', message: 'Too many room lookups. Please wait a moment.' };
      }
      if (!/^(?:[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{3}|[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4})$/i.test(params.code)) {
        set.status = 400;
        return { error: 'INVALID_ROOM_CODE' };
      }
      const room = await store.getRoom(params.code);
      if (!room) {
        set.status = 404;
        return { error: 'ROOM_NOT_FOUND' };
      }
      const members = await store.listMembers(params.code);
      return {
        code: room.code,
        name: room.name ?? '',
        expiresAt: room.expiresAt,
        memberCount: members.length,
      };
    });
}
