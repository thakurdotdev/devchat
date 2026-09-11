/**
 * In-memory RoomStore — Maps + a TTL sweeper. Rooms die when:
 *  - expiresAt passes (hard cap), or
 *  - the room has 0 members for longer than the empty-grace period.
 */
import type { ChatMessage, Member, Room } from '@devchat/shared';
import type { CreateRoomOpts, RoomStore } from './interface';

interface MemoryRoom {
  room: Room & { hostSecret: string };
  members: Map<string, Member>;
  messages: ChatMessage[];
  /** when the room became empty (0 members); undefined while occupied */
  emptySince?: number;
}

export class MemoryStore implements RoomStore {
  readonly kind = 'memory' as const;
  private rooms = new Map<string, MemoryRoom>();
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(
    private emptyGraceMs: number,
    sweepIntervalMs = 30_000,
  ) {
    this.sweeper = setInterval(() => this.sweep(), sweepIntervalMs);
    // never keep the process alive just for sweeping
    this.sweeper.unref?.();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.cache.clear();
  }

  async createRoom(opts: CreateRoomOpts): Promise<Room> {
    const now = Date.now();
    const room: MemoryRoom['room'] = {
      code: '', // filled by caller (ids.ts) before insert; see createRoomWithCode
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

  async touchRoom(code: string, expiresAt: number) {
    const entry = this.rooms.get(code);
    if (entry) entry.room.expiresAt = expiresAt;
  }

  async addMember(code: string, member: Member) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.members.set(member.id, member);
    entry.emptySince = undefined;
  }

  async removeMember(code: string, memberId: string) {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.members.delete(memberId);
    if (entry.members.size === 0) entry.emptySince = Date.now();
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

  private sweep() {
    const now = Date.now();
    for (const [code, entry] of this.rooms) {
      if (now >= entry.room.expiresAt) {
        this.rooms.delete(code);
        continue;
      }
      if (
        entry.members.size === 0 &&
        entry.emptySince &&
        now - entry.emptySince > this.emptyGraceMs
      ) {
        this.rooms.delete(code);
      }
    }
    for (const [key, hit] of this.cache) {
      if (now >= hit.expiresAt) this.cache.delete(key);
    }
  }
}
