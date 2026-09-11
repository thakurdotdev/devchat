/**
 * Room hub — join/leave/broadcast logic. Owns the live connection registry
 * (WS-level membership is the source of truth for "who's online"); the store
 * keeps the persistent bits (room record, history, persisted members).
 */
import type { ChatMessage, Member } from '@devchat/shared';
import {
  ERROR_CODES,
  EXPIRY_WARNING_BEFORE_MIN,
  TYPING_THROTTLE_MS,
} from '@devchat/shared';
import { newId } from '../utils/ids';
import type { RoomStore } from '../store/interface';
import type { Config } from '../config';

/** Minimal structural type for an Elysia/Bun WS connection we can send to. */
export interface WsLike {
  send(data: string): unknown;
  close(code?: number, reason?: string): unknown;
}

export interface Conn {
  id: string;
  ws: WsLike;
  roomCode: string | null;
  member: Member | null;
  lastSeen: number;
  lastTypingSent: number;
}

export class RoomHub {
  /** connId → conn */
  private conns = new Map<string, Conn>();
  /** roomCode → set of connIds */
  private roomConns = new Map<string, Set<string>>();
  /** roomCode → expiry-warning timer */
  private warningTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private store: RoomStore, private config: Config) {}

  get connCount() {
    return this.conns.size;
  }

  register(ws: WsLike, id?: string): Conn {
    const conn: Conn = {
      id: id ?? newId(),
      ws,
      roomCode: null,
      member: null,
      lastSeen: Date.now(),
      lastTypingSent: 0,
    };
    this.conns.set(conn.id, conn);
    return conn;
  }

  async join(conn: Conn, code: string, name: string, color: string, userId?: string): Promise<ErrorPayloadOr<Welcome>> {
    const room = await this.store.getRoom(code);
    if (!room) {
      return { error: true, code: ERROR_CODES.ROOM_NOT_FOUND, message: `Room ${code} does not exist (or expired)` };
    }

    const memberId = (userId && userId.trim()) ? userId.trim().slice(0, 48) : conn.id;

    // If another connection with the same memberId is already present in this room
    // (e.g. client reloaded or reconnected before dead socket heartbeat clean-up),
    // cleanly close the old stale connection.
    for (const existingConn of this.connectionsIn(code)) {
      if (existingConn.member?.id === memberId && existingConn.id !== conn.id) {
        try {
          existingConn.ws.close(1000, 'reconnected');
        } catch {
          /* ignore */
        }
        this.conns.delete(existingConn.id);
        this.roomConns.get(code)?.delete(existingConn.id);
      }
    }

    const members = await this.store.listMembers(code);
    const onlineIds = new Set(this.onlineMemberIds(code));
    const present = members.filter((m) => onlineIds.has(m.id));

    if (conn.roomCode === code) return { error: true, code: ERROR_CODES.INVALID, message: 'Already in this room' };
    if (present.length >= this.config.maxMembers) {
      return { error: true, code: ERROR_CODES.ROOM_FULL, message: `Room ${code} is full (${this.config.maxMembers} max)` };
    }

    const member: Member = {
      id: memberId,
      name,
      color,
      joinedAt: Date.now(),
    };

    // Leaving a previous room first (single-room membership)
    if (conn.roomCode) await this.leave(conn);

    // Revive grace-period rooms on rejoin: TTL resets to full room TTL.
    if (room.expiresAt - Date.now() < this.config.emptyGraceMs) {
      await this.store.touchRoom(code, Date.now() + this.config.roomTtlMs);
    }

    conn.roomCode = code;
    conn.member = member;
    await this.store.addMember(code, member);
    this.conns.set(conn.id, conn);
    this.roomConns.get(code)?.add(conn.id) ?? this.roomConns.set(code, new Set([conn.id]));

    const systemMsg = this.systemMessage(code, `${name} joined`);
    await this.store.pushMessage(code, systemMsg, this.config.messageHistory);

    const recentMessages = await this.store.getMessages(code);
    const expiresAt = (await this.store.getRoom(code))?.expiresAt ?? room.expiresAt;

    conn.ws.send(JSON.stringify({
      type: 'welcome',
      you: member.id,
      room: { code, expiresAt },
      members: await this.onlineMembers(code),
      recentMessages,
      expiresAt,
    }));

    this.broadcast(code, {
      type: 'member.joined',
      member,
      message: systemMsg,
    }, conn.id);

    this.scheduleExpiryWarning(code, expiresAt);
    return { error: false, payload: { you: member.id, code, expiresAt } };
  }

  async leave(conn: Conn): Promise<void> {
    const code = conn.roomCode;
    if (!code || !conn.member) return;
    conn.roomCode = null;
    const member = conn.member;
    conn.member = null;

    this.roomConns.get(code)?.delete(conn.id);
    if (this.roomConns.get(code)?.size === 0) this.roomConns.delete(code);

    await this.store.removeMember(code, member.id);

    const stillOnline = this.onlineMemberIds(code);
    if (stillOnline.length === 0) {
      this.cancelExpiryWarning(code);
      // Empty → enter grace period: extend TTL to now + grace, but never past
      // the hard cap (createdAt + roomTtl).
      const room = await this.store.getRoom(code);
      if (room) {
        const hardCap = room.createdAt + this.config.roomTtlMs;
        await this.store.touchRoom(code, Math.min(Date.now() + this.config.emptyGraceMs, hardCap));
      }
    } else {
      const systemMsg = this.systemMessage(code, `${member.name} left`);
      await this.store.pushMessage(code, systemMsg, this.config.messageHistory);
      this.broadcast(code, {
        type: 'member.left',
        memberId: member.id,
        message: systemMsg,
      });
    }
  }

  disconnect(conn: Conn) {
    this.conns.delete(conn.id);
    // fire-and-forget cleanup
    void this.leave(conn);
  }

  connectionsIn(code: string): Conn[] {
    const ids = this.roomConns.get(code);
    if (!ids) return [];
    return [...ids].map((id) => this.conns.get(id)).filter((c): c is Conn => !!c);
  }

  onlineMemberIds(code: string): string[] {
    return this.connectionsIn(code).map((c) => c.member!.id);
  }

  async onlineMembers(code: string): Promise<Member[]> {
    const ids = new Set(this.onlineMemberIds(code));
    const all = await this.store.listMembers(code);
    return all.filter((m) => ids.has(m.id));
  }

  /** Broadcast a frame to every live connection in a room. */
  broadcast(code: string, frame: Record<string, unknown>, excludeConnId?: string) {
    const payload = JSON.stringify(frame);
    for (const conn of this.connectionsIn(code)) {
      if (excludeConnId && conn.id === excludeConnId) continue;
      try {
        conn.ws.send(payload);
      } catch {
        this.disconnect(conn);
      }
    }
  }

  /** Server throttles typing broadcasts to 1/sec per user. */
  shouldBroadcastTyping(conn: Conn): boolean {
    const now = Date.now();
    if (now - conn.lastTypingSent < TYPING_THROTTLE_MS) return false;
    conn.lastTypingSent = now;
    return true;
  }

  async buildMessage(conn: Conn, text: string): Promise<ChatMessage> {
    return {
      id: newId(),
      roomCode: conn.roomCode!,
      kind: 'text',
      memberId: conn.member!.id,
      name: conn.member!.name,
      color: conn.member!.color,
      text,
      createdAt: Date.now(),
      reactions: {},
    };
  }

  systemMessage(code: string, text: string): ChatMessage {
    return {
      id: newId(),
      roomCode: code,
      kind: 'system',
      memberId: null,
      name: 'system',
      color: '#888888',
      text,
      createdAt: Date.now(),
    };
  }

  /** Warn everyone 2 minutes before the room dies. */
  private scheduleExpiryWarning(code: string, expiresAt: number) {
    this.cancelExpiryWarning(code);
    const warnAt = expiresAt - EXPIRY_WARNING_BEFORE_MIN * 60_000 - Date.now();
    if (warnAt <= 0) return; // already inside the warning window
    const timer = setTimeout(() => {
      this.warningTimers.delete(code);
      this.broadcast(code, {
        type: 'room.expiring',
        expiresAt,
        message: `Room ${code} expires in ${EXPIRY_WARNING_BEFORE_MIN} minutes`,
      });
    }, warnAt);
    timer.unref?.();
    this.warningTimers.set(code, timer);
  }

  private cancelExpiryWarning(code: string) {
    const t = this.warningTimers.get(code);
    if (t) clearTimeout(t);
    this.warningTimers.delete(code);
  }
}

export interface Welcome {
  you: string;
  code: string;
  expiresAt: number;
}

export type ErrorPayloadOr<T> =
  | { error: true; code: string; message: string }
  | { error: false; payload: T };
