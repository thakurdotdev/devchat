/** REST: create room / room info. */
import { Elysia } from 'elysia';
import type { RoomStore } from '../store/interface';
import { newHostSecret, newRoomCode } from '../utils/ids';
import type { Config } from '../config';

export function roomRoutes(store: RoomStore, config: Config) {
  return new Elysia({ prefix: '/api/rooms' })
    .post('/', async () => {
      // createRoom() generates the timestamps; we assign the code + secret
      // and persist, retrying on the (astronomically unlikely) code clash.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const base = await store.createRoom({ ttlMs: config.roomTtlMs, hostSecret: newHostSecret() });
        const room = { ...base, code };
        if (await store.getRoom(code)) continue; // collision — retry
        await store.saveRoom({ ...room, hostSecret: newHostSecret() });
        return {
          code: room.code,
          expiresAt: room.expiresAt,
          url: `/ws?room=${room.code}`,
        };
      }
      throw new Error('could not allocate room code');
    })
    .get('/:code', async ({ params, set }) => {
      const room = await store.getRoom(params.code);
      if (!room) {
        set.status = 404;
        return { error: 'ROOM_NOT_FOUND' };
      }
      const members = await store.listMembers(params.code);
      return {
        code: room.code,
        expiresAt: room.expiresAt,
        memberCount: members.length,
      };
    });
}
