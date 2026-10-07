/**
 * Store interface — the single contract both MemoryStore and RedisStore
 * implement. Everything above this layer (WS, REST) depends only on this.
 */
import type { ChatMessage, Member, Room } from '@devchat/shared';

export interface CreateRoomOpts {
  ttlMs: number;
  hostSecret: string;
  name?: string;
}

export interface RoomStore {
  readonly kind: 'memory' | 'redis';

  createRoom(opts: CreateRoomOpts): Promise<Room>;
  getRoom(code: string): Promise<(Room & { hostSecret?: string }) | null>;
  deleteRoom(code: string): Promise<void>;
  listRoomCodes(): Promise<string[]>;
  /** Persist a fully-formed room (code assigned by utils/ids.ts). */
  saveRoom(room: Room & { hostSecret: string }): Promise<void>;

  addMember(code: string, member: Member): Promise<void>;
  removeMember(code: string, memberId: string): Promise<void>;
  listMembers(code: string): Promise<Member[]>;

  /** Ring buffer — keeps only the last MESSAGE_HISTORY messages. */
  pushMessage(code: string, msg: ChatMessage, history: number): Promise<void>;
  getMessages(code: string): Promise<ChatMessage[]>;
  /** Persist reaction updates onto a stored message. */
  updateMessage(code: string, msg: ChatMessage): Promise<void>;
  deleteMessage(code: string, messageId: string): Promise<void>;

  /** Generic KV cache (used by the media proxy). */
  cacheSet(key: string, value: string, ttlSec: number): Promise<void>;
  cacheGet(key: string): Promise<string | null>;

  /** Atomically consume one shared rate-limit token across server instances. */
  consumeRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }>;
}
