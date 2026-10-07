/**
 * In-memory RoomStore — Maps + one lightweight TTL sweeper. Rooms remain
 * available while empty and are removed when their selected expiry passes.
 */
import type { ChatMessage, Member, Room } from '@devchat/shared';
import type { CreateRoomOpts, RoomStore } from './interface';

interface MemoryRoom {
  room: Room & { hostSecret: string };
  members: Map<string, Member>;
  messages: ChatMessage[];
}

export class MemoryStore implements RoomStore {
  readonly kind = 'memory' as const;
  private rooms = new Map<string, MemoryRoom>();
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private rateLimits = new Map<string, { count: number; expiresAt: number }>();
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(sweepIntervalMs = 30_000) {
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    // never keep the process alive just for sweeping
    this.sweeper.unref?.();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.cache.clear();
    this.rateLimits.clear();
  }

  async createRoom(opts: CreateRoomOpts): Promise<Room> {
    const now = Date.now();
    const room: MemoryRoom['room'] = {
      code: '', // filled by caller (ids.ts) before insert; see createRoomWithCode
      name: opts.name,
      createdAt: now,
      expiresAt: now + opts.ttlMs,
      hostSecret: opts.hostSecret,
    };
    return room;
  }

  /** MemoryStore insert helper — the room generator assigns the code. */
  async saveRoom(room: Room & { hostSecret: string }) {
    this.rooms.set(room.code, { room, members: new Map(), messages: [] });
  }

  async getRoom(code: string) {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    if (Date.now() >= entry.room.expiresAt) {
      this.rooms.delete(code);
      return null;
    }
    return { ...entry.room };
  }

  async deleteRoom(code: string) {
    this.rooms.delete(code);
  }

  async listRoomCodes() {
    return [...this.rooms.keys()];
  }

  async addMember(code: string, member: Member) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.members.set(member.id, member);
  }

  async removeMember(code: string, memberId: string) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.members.delete(memberId);
  }

  async listMembers(code: string) {
    return [...(this.rooms.get(code)?.members.values() ?? [])];
  }

  async pushMessage(code: string, msg: ChatMessage, history: number) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.messages.push(msg);
    if (entry.messages.length > history) {
      entry.messages.splice(0, entry.messages.length - history);
    }
  }

  async getMessages(code: string) {
    return [...(this.rooms.get(code)?.messages ?? [])];
  }

  async updateMessage(code: string, msg: ChatMessage) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    const idx = entry.messages.findIndex((m) => m.id === msg.id);
    if (idx >= 0) entry.messages[idx] = msg;
  }

  async deleteMessage(code: string, messageId: string) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.messages = entry.messages.filter((message) => message.id !== messageId);
  }

  async cacheSet(key: string, value: string, ttlSec: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async cacheGet(key: string) {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    let bucket = this.rateLimits.get(key);
    if (!bucket || now >= bucket.expiresAt) {
      bucket = { count: 0, expiresAt: now + windowMs };
      this.rateLimits.set(key, bucket);
    }
    bucket.count++;
    return { allowed: bucket.count <= limit, retryAfterMs: Math.max(0, bucket.expiresAt - now) };
  }

  private sweep() {
    const now = Date.now();
    for (const [code, entry] of this.rooms) {
      if (now >= entry.room.expiresAt) {
        this.rooms.delete(code);
        continue;
      }
    }
    for (const [key, hit] of this.cache) {
      if (now >= hit.expiresAt) this.cache.delete(key);
    }
    for (const [key, bucket] of this.rateLimits) {
      if (now >= bucket.expiresAt) this.rateLimits.delete(key);
    }
  }
}
