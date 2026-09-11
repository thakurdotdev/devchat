/**
 * WS entrypoint — single endpoint: /ws?room=CODE&name=NICKNAME&color=HEX
 * The first frame may be a `join` event; if absent, query params are used.
 * Every inbound frame is validated against the shared TypeBox schemas.
 */
import {
  ERROR_CODES,
  DEAD_SOCKET_SILENCE_MS,
  HEARTBEAT_INTERVAL_MS,
} from '@devchat/shared';
import {
  AudioEvent,
  GifEvent,
  JoinEvent,
  MessageEvent,
  ReactEvent,
  TypingEvent,
} from '@devchat/shared';
import { Value } from '@sinclair/typebox/value';
import type { ChatMessage } from '@devchat/shared';
import type { Config } from '../config';
import type { RoomStore } from '../store/interface';
import { newId } from '../utils/ids';
import { RoomHub, type Conn, type WsLike } from './rooms';
import { RateLimiter } from './rateLimit';

interface RawWs {
  send(data: string | object): unknown;
  close(code?: number, reason?: string): unknown;
  data?: {
    id?: string;
    query?: Record<string, string>;
  };
}

/** Minimal structural type — avoids Elysia's deep generic variance in signatures. */
export interface WsCapableApp {
  ws(path: string, options: Record<string, unknown>): unknown;
}

export function wireWebSocket(app: WsCapableApp, store: RoomStore, config: Config) {
  const hub = new RoomHub(store, config);

  /** connId (=== ws.id, stable across events) → conn */
  const connsById = new Map<string, Conn>();

  function sendError(conn: Conn, code: string, message: string) {
    try {
      conn.ws.send(JSON.stringify({ type: 'error', code, message }));
    } catch {
      /* socket already dead */
    }
  }

  const limiter = new RateLimiter(
    (connId) => {
      const conn = connsById.get(connId);
      if (!conn) return;
      sendError(conn, ERROR_CODES.KICKED, 'Kicked for repeated rate limit violations');
      try {
        conn.ws.close(1008, 'kicked');
      } catch {
        /* ignore */
      }
      hub.disconnect(conn);
      dispose(conn);
    },
    (connId, code, message) => {
      const conn = connsById.get(connId);
      if (conn) sendError(conn, code, message);
    },
  );

  function dispose(conn: Conn) {
    limiter.dispose(conn.id);
    connsById.delete(conn.id);
  }

  // ---- dead-socket cleanup: heartbeat every 25s, kill after 60s silence ----
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const conn of connsById.values()) {
      if (now - conn.lastSeen > DEAD_SOCKET_SILENCE_MS) {
        try {
          conn.ws.close(1001, 'silent');
        } catch {
          /* ignore */
        }
        hub.disconnect(conn);
        dispose(conn);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  // ---------------- Elysia WS route ----------------

  app.ws('/ws', {
    open(ws: RawWs) {
      const raw = ws as unknown as RawWs;
      const connId = raw.data?.id;
      if (!connId) return; // no id — cannot track this socket
      const wrapper: WsLike = {
        send: (data: string) => raw.send(data),
        close: (code?: number, reason?: string) => raw.close(code, reason),
      };
      const conn = hub.register(wrapper, connId);
      connsById.set(connId, conn);
    },

    async message(ws: RawWs, raw: unknown) {
      const conn = connsById.get((ws as unknown as RawWs).data?.id ?? '');
      if (!conn) return;
      conn.lastSeen = Date.now();

      let frame: unknown;
      try {
        // Elysia 1.4 auto-parses JSON frames into objects; older versions and
        // raw sockets pass strings or MessageEvents — handle all three.
        if (typeof raw === 'string') frame = JSON.parse(raw);
        else if (raw && typeof raw === 'object' && 'data' in (raw as object) && !('type' in (raw as object)))
          frame = JSON.parse(String((raw as { data?: unknown }).data));
        else frame = raw;
      } catch {
        return sendError(conn, ERROR_CODES.INVALID, 'Frames must be JSON');
      }

      // ---- handshake: first frame must be join (or fall back to query params) ----
      if (!conn.member) {
        const query = (ws as unknown as RawWs).data?.query ?? {};
        if (Value.Check(JoinEvent, frame)) {
          const p = frame as { name: string; color: string };
          await doJoin(conn, query.room ?? '', p.name, p.color);
        } else if (query.room && query.name) {
          await doJoin(conn, query.room, query.name, query.color || '#7c5cff');
        } else {
          sendError(conn, ERROR_CODES.INVALID, 'First frame must be a join event (or provide ?room&name query params)');
        }
        return;
      }

      const evt = frame as { type?: string };
      if (typeof evt?.type !== 'string') {
        return sendError(conn, ERROR_CODES.INVALID, 'Missing event type');
      }
      const code = conn.roomCode!;

      try {
        switch (evt.type) {
        case 'message': {
          if (!Value.Check(MessageEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid message payload');
          if (!limiter.consume(conn.id, 'text')) return;
          const msg = await hub.buildMessage(conn, (frame as { text: string }).text);
          await store.pushMessage(code, msg, config.messageHistory);
          hub.broadcast(code, { type: 'message', ...msg });
          break;
        }
        case 'gif': {
          if (!Value.Check(GifEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid gif payload');
          await handleMedia(conn, frame as Record<string, unknown>, 'gif');
          break;
        }
        case 'audio': {
          if (!Value.Check(AudioEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid audio payload');
          await handleMedia(conn, frame as Record<string, unknown>, 'sound');
          break;
        }
        case 'typing': {
          if (!Value.Check(TypingEvent, frame)) return;
          if (!hub.shouldBroadcastTyping(conn)) return;
          hub.broadcast(code, { type: 'typing', memberId: conn.member!.id }, conn.id);
          break;
        }
        case 'react': {
          if (!Value.Check(ReactEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid react payload');
          await handleReact(conn, frame as { messageId: string; emoji: string });
          break;
        }
        case 'join': {
          sendError(conn, ERROR_CODES.INVALID, 'Already joined — leave and rejoin to change identity');
          break;
        }
        case 'ping': {
          // heartbeat — lastSeen already updated at top of message()
          break;
        }
        case 'leave': {
          await hub.leave(conn);
          try {
            conn.ws.close(1000, 'bye');
          } catch {
            /* ignore */
          }
          break;
        }
        default:
          sendError(conn, ERROR_CODES.INVALID, `Unknown event type: ${evt.type}`);
        }
      } catch (err) {
        console.error(`[ws] error handling ${evt.type} from ${conn.id}:`, err);
        sendError(conn, ERROR_CODES.INVALID, 'Server error handling frame');
      }
    },

    close(ws: RawWs) {
      const conn = connsById.get((ws as unknown as RawWs).data?.id ?? '');
      if (!conn) return;
      hub.disconnect(conn);
      dispose(conn);
    },
  });

  // ---------------- helpers ----------------

  async function doJoin(conn: Conn, room: string, name: string, color: string) {
    if (!room) return sendError(conn, ERROR_CODES.INVALID, 'Missing room code');
    const result = await hub.join(conn, room.trim().toUpperCase(), name.trim().slice(0, 32), color);
    if (result.error) sendError(conn, result.code, result.message);
  }

  async function handleMedia(conn: Conn, frame: Record<string, unknown>, kind: 'gif' | 'sound') {
    if (!limiter.consume(conn.id, 'media')) return;
    const code = conn.roomCode!;
    const media: ChatMessage['media'] = {
      kind,
      id: String(frame.id),
      title: String(frame.title ?? frame.id),
      url: String(frame.url),
      ...(kind === 'gif' ? { preview: String(frame.preview) } : {}),
      ...(typeof frame.duration === 'number' ? { duration: frame.duration } : {}),
    };
    const msg: ChatMessage = {
      id: newId(),
      roomCode: code,
      kind: kind === 'gif' ? 'gif' : 'audio',
      memberId: conn.member!.id,
      name: conn.member!.name,
      color: conn.member!.color,
      createdAt: Date.now(),
      reactions: {},
      media,
    };
    await store.pushMessage(code, msg, config.messageHistory);
    hub.broadcast(code, { type: kind === 'gif' ? 'gif' : 'audio', ...msg });
  }

  async function handleReact(conn: Conn, payload: { messageId: string; emoji: string }) {
    const code = conn.roomCode!;
    const messages = await store.getMessages(code);
    const msg = messages.find((m) => m.id === payload.messageId);
    if (!msg) return sendError(conn, ERROR_CODES.INVALID, 'Message not found');
    const reactions = { ...(msg.reactions ?? {}) };
    const actors = new Set(reactions[payload.emoji] ?? []);
    const me = conn.member!.id;
    if (actors.has(me)) actors.delete(me);
    else actors.add(me);
    if (actors.size === 0) delete reactions[payload.emoji];
    else reactions[payload.emoji] = [...actors];
    msg.reactions = reactions;
    await store.updateMessage(code, msg);
    hub.broadcast(code, { type: 'react', messageId: msg.id, emoji: payload.emoji, memberId: me, reactions });
  }

  return { hub, heartbeat };
}
