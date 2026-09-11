/**
 * Redis RoomStore — key design:
 *   room:{code}          → hash (createdAt, hostSecret, expiresAt)
 *   room:{code}:members  → hash memberId → member JSON
 *   room:{code}:messages → list (LPUSH + LTRIM to history cap)
 *   cache:{kind}:{hash}  → string with TTL
 * All room keys get EXPIRE = room TTL; Redis handles expiry natively.
 */
import type { ChatMessage, Member, Room } from '@devchat/shared';
import type Redis from 'ioredis';
import type { CreateRoomOpts, RoomStore } from './interface';

const roomKey = (code: string) => `room:${code}`;
const membersKey = (code: string) => `room:${code}:members`;
const messagesKey = (code: string) => `room:${code}:messages`;

export class RedisStore implements RoomStore {
  readonly kind = 'redis' as const;

  private constructor(private redis: Redis) {}

  static async connect(url: string): Promise<RedisStore> {
    const { default: RedisCtor } = await import('ioredis');
    const redis = new RedisCtor(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    await redis.ping(); // fail fast if unreachable — caller falls back to memory
    return new RedisStore(redis);
  }

  async disconnect() {
    await this.redis.quit();
  }

  private async expireAll(code: string, ttlSec: number) {
    const p = this.redis.pipeline();
    p.expire(roomKey(code), ttlSec);
    p.expire(membersKey(code), ttlSec);
    p.expire(messagesKey(code), ttlSec);
    await p.exec();
  }

  async createRoom(opts: CreateRoomOpts): Promise<Room> {
    const now = Date.now();
    return {
      code: '', // assigned by caller before persist (see persistRoom)
      createdAt: now,
      expiresAt: now + opts.ttlMs,
    };
  }

  async saveRoom(room: Room & { hostSecret: string }) {
    const ttlSec = Math.max(60, Math.ceil((room.expiresAt - Date.now()) / 1000));
    await this.redis.hset(roomKey(room.code), {
      createdAt: String(room.createdAt),
      hostSecret: room.hostSecret,
      expiresAt: String(room.expiresAt),
    });
    await this.redis.expire(roomKey(room.code), ttlSec);
  }

  async getRoom(code: string) {
    const raw = await this.redis.hgetall(roomKey(code));
    if (!raw || !raw.createdAt) return null;
    return {
      code,
      createdAt: Number(raw.createdAt),
      expiresAt: Number(raw.expiresAt),
      hostSecret: raw.hostSecret,
    };
  }

  async deleteRoom(code: string) {
    const p = this.redis.pipeline();
    p.del(roomKey(code), membersKey(code), messagesKey(code));
    await p.exec();
  }

  async listRoomCodes() {
    const keys = await this.redis.keys('room:*');
    return keys
      .filter((k) => !k.includes(':members') && !k.includes(':messages'))
      .map((k) => k.slice('room:'.length));
  }

  async touchRoom(code: string, expiresAt: number) {
    await this.redis.hset(roomKey(code), 'expiresAt', String(expiresAt));
    await this.expireAll(code, Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000)));
  }

  async addMember(code: string, member: Member) {
    await this.redis.hset(membersKey(code), member.id, JSON.stringify(member));
    await this.refreshTtl(code);
  }

  async removeMember(code: string, memberId: string) {
    await this.redis.hdel(membersKey(code), memberId);
    await this.refreshTtl(code);
  }

  async listMembers(code: string) {
    const raw = await this.redis.hgetall(membersKey(code));
    return Object.values(raw)
      .map((json) => JSON.parse(json) as Member)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async pushMessage(code: string, msg: ChatMessage, history: number) {
    await this.redis.lpush(messagesKey(code), JSON.stringify(msg));
    await this.redis.ltrim(messagesKey(code), 0, history - 1);
    await this.refreshTtl(code);
  }

  async getMessages(code: string) {
    const raw = await this.redis.lrange(messagesKey(code), 0, -1);
    return raw
      .map((json) => JSON.parse(json) as ChatMessage)
      .sort((a, b) => a.createdAt - b.createdAt); // lpush stores newest-first
  }

  async updateMessage(code: string, msg: ChatMessage) {
    const raw = await this.redis.lrange(messagesKey(code), 0, -1);
    const idx = raw.findIndex((json) => (JSON.parse(json) as ChatMessage).id === msg.id);
    if (idx >= 0) await this.redis.lset(messagesKey(code), idx, JSON.stringify(msg));
  }

  async cacheSet(key: string, value: string, ttlSec: number) {
    await this.redis.set(`cache:${key}`, value, 'EX', ttlSec);
  }

  async cacheGet(key: string) {
    return this.redis.get(`cache:${key}`);
  }

  /** Slide the room TTL forward so active rooms never expire mid-session. */
  private async refreshTtl(code: string) {
    const room = await this.getRoom(code);
    if (!room) return;
    await this.expireAll(code, Math.max(60, Math.ceil((room.expiresAt - Date.now()) / 1000)));
  }
}
