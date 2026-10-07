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
  DeleteMessageEvent,
  EditMessageEvent,
  GifEvent,
  JoinEvent,
  MessageEvent,
  PinMessageEvent,
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
import { normalizeIp } from '../utils/clientIp';

interface RawWs {
  send(data: string | object): unknown;
  close(code?: number, reason?: string): unknown;
  remoteAddress?: string;
  data?: {
    id?: string;
    query?: Record<string, string>;
    remoteAddress?: string;
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
  const ipByConnId = new Map<string, string>();
  const connIdsByIp = new Map<string, Set<string>>();
  const handshakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const frameWindows = new Map<string, { count: number; resetAt: number }>();

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
    const handshakeTimer = handshakeTimers.get(conn.id);
    if (handshakeTimer) clearTimeout(handshakeTimer);
    handshakeTimers.delete(conn.id);
    frameWindows.delete(conn.id);
    const ip = ipByConnId.get(conn.id);
    ipByConnId.delete(conn.id);
    if (ip) {
      const ids = connIdsByIp.get(ip);
      ids?.delete(conn.id);
      if (ids?.size === 0) connIdsByIp.delete(ip);
    }
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
    maxPayloadLength: config.wsMessageBytes,
    backpressureLimit: config.wsMessageBytes * 8,
    closeOnBackpressureLimit: true,
    beforeHandle({ request, set }: { request: Request; set: { status?: any } }) {
      if (!config.allowedWsOrigins.length) return;
      const origin = request.headers.get('origin');
      // Native clients may omit Origin. Browser clients can be restricted to
      // an explicit operator-maintained list, which supports dynamic webview hosts.
      if (origin && !config.allowedWsOrigins.includes(origin)) {
        set.status = 403;
        return { error: 'ORIGIN_NOT_ALLOWED' };
      }
    },
    open(ws: RawWs) {
      const raw = ws as unknown as RawWs;
      const connId = raw.data?.id;
      if (!connId) return; // no id — cannot track this socket
      const ip = normalizeIp(raw.remoteAddress);
      if (connsById.size >= config.wsConnectionsGlobal || (connIdsByIp.get(ip)?.size ?? 0) >= config.wsConnectionsPerIp) {
        raw.close(1013, 'connection limit reached');
        return;
      }
      const wrapper: WsLike = {
        send: (data: string) => raw.send(data),
        close: (code?: number, reason?: string) => raw.close(code, reason),
      };
      const conn = hub.register(wrapper, connId);
      connsById.set(connId, conn);
      ipByConnId.set(connId, ip);
      const ipConnections = connIdsByIp.get(ip) ?? new Set<string>();
      ipConnections.add(connId);
      connIdsByIp.set(ip, ipConnections);
      handshakeTimers.set(connId, setTimeout(() => {
        const pending = connsById.get(connId);
        if (!pending || pending.member) return;
        pending.ws.close(1008, 'join handshake timed out');
        hub.disconnect(pending);
        dispose(pending);
      }, 10_000));
    },

    async message(ws: RawWs, raw: unknown) {
      const conn = connsById.get((ws as unknown as RawWs).data?.id ?? '');
      if (!conn) return;
      conn.lastSeen = Date.now();

      const now = Date.now();
      const window = frameWindows.get(conn.id);
      const currentWindow = !window || now >= window.resetAt ? { count: 0, resetAt: now + 60_000 } : window;
      currentWindow.count++;
      frameWindows.set(conn.id, currentWindow);
      if (currentWindow.count > config.wsFramesPerMinute) {
        sendError(conn, 'RATE_LIMITED', 'You are sending messages too quickly. Please slow down.');
        conn.ws.close(1013, 'frame rate limit');
        hub.disconnect(conn);
        dispose(conn);
        return;
      }

      // Bound frames before application parsing and schema validation.
      try {
        const frameBytes = typeof raw === 'string'
          ? new TextEncoder().encode(raw).byteLength
          : raw instanceof ArrayBuffer ? raw.byteLength
          : ArrayBuffer.isView(raw) ? raw.byteLength
          : new TextEncoder().encode(JSON.stringify(raw)).byteLength;
        if (frameBytes > config.wsMessageBytes) {
          sendError(conn, ERROR_CODES.INVALID, 'Message is too large');
          conn.ws.close(1009, 'message too large');
          hub.disconnect(conn);
          dispose(conn);
          return;
        }
      } catch {
        sendError(conn, ERROR_CODES.INVALID, 'Invalid frame');
        return;
      }

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
          const p = frame as { room?: string; name: string; color: string };
          await doJoin(conn, p.room ?? query.room ?? '', p.name, p.color);
        } else if (query.room && query.name) {
          await doJoin(conn, query.room, query.name, query.color || '#7c5cff');
        } else {
          sendError(conn, ERROR_CODES.INVALID, 'First frame must be a join event (or provide ?room&name query params)');
        }
        if (conn.member) {
          const timer = handshakeTimers.get(conn.id);
          if (timer) clearTimeout(timer);
          handshakeTimers.delete(conn.id);
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
          const payload = frame as { text: string; replyToId?: string };
          const msg = await hub.buildMessage(conn, payload.text);
          if (payload.replyToId) {
            const target = (await store.getMessages(code)).find((item) => item.id === payload.replyToId);
            if (!target) return sendError(conn, ERROR_CODES.INVALID, 'Reply target is no longer available');
            msg.replyTo = {
              id: target.id,
              name: target.name,
              text: target.kind === 'text' ? (target.text ?? '') : target.media?.title ?? 'Shared media',
            };
          }
          await store.pushMessage(code, msg, config.messageHistory);
          hub.broadcast(code, { type: 'message', ...msg });
          break;
        }
        case 'message.edit': {
          if (!Value.Check(EditMessageEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid edit payload');
          if (!limiter.consume(conn.id, 'text')) return;
          const payload = frame as { messageId: string; text: string };
          const text = payload.text.trim();
          if (!text) return sendError(conn, ERROR_CODES.INVALID, 'Message cannot be empty');
          const msg = (await store.getMessages(code)).find((item) => item.id === payload.messageId);
          if (!msg || msg.kind !== 'text') return sendError(conn, ERROR_CODES.INVALID, 'Message is no longer available');
          if (msg.memberId !== conn.member!.id) return sendError(conn, ERROR_CODES.INVALID, 'You can only edit your own messages');
          if (Date.now() - msg.createdAt > 15 * 60_000) return sendError(conn, ERROR_CODES.INVALID, 'Messages can only be edited for 15 minutes');
          msg.text = text;
          msg.editedAt = Date.now();
          await store.updateMessage(code, msg);
          hub.broadcast(code, { type: 'message.updated', message: msg });
          break;
        }
        case 'message.delete': {
          if (!Value.Check(DeleteMessageEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid delete payload');
          if (!limiter.consume(conn.id, 'text')) return;
          const payload = frame as { messageId: string };
          const msg = (await store.getMessages(code)).find((item) => item.id === payload.messageId);
          if (!msg || msg.kind !== 'text') return sendError(conn, ERROR_CODES.INVALID, 'Message is no longer available');
          if (msg.memberId !== conn.member!.id) return sendError(conn, ERROR_CODES.INVALID, 'You can only delete your own messages');
          if (Date.now() - msg.createdAt > 15 * 60_000) return sendError(conn, ERROR_CODES.INVALID, 'Messages can only be deleted for 15 minutes');
          await store.deleteMessage(code, msg.id);
          hub.broadcast(code, { type: 'message.deleted', messageId: msg.id });
          break;
        }
        case 'message.pin': {
          if (!Value.Check(PinMessageEvent, frame)) return sendError(conn, ERROR_CODES.INVALID, 'Invalid pin payload');
          if (!limiter.consume(conn.id, 'text')) return;
          const payload = frame as { messageId: string; pinned: boolean };
          const messages = await store.getMessages(code);
          const msg = messages.find((item) => item.id === payload.messageId);
          if (!msg || msg.kind === 'system') return sendError(conn, ERROR_CODES.INVALID, 'Message is no longer available');
          if (payload.pinned && !msg.pinned && messages.filter((item) => item.pinned).length >= 10) {
            return sendError(conn, ERROR_CODES.INVALID, 'This room already has 10 pinned messages');
          }
          msg.pinned = payload.pinned;
          await store.updateMessage(code, msg);
          hub.broadcast(code, { type: 'message.updated', message: msg });
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
    const normalizedRoom = room.trim().toUpperCase();
    const normalizedName = name.trim();
    if (!/^(?:[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{3}|[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4})$/.test(normalizedRoom)) {
      return sendError(conn, ERROR_CODES.INVALID, 'Enter a valid room code');
    }
    if (!normalizedName || normalizedName.length > 32 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return sendError(conn, ERROR_CODES.INVALID, 'Check your display name and color');
    }
    const ip = ipByConnId.get(conn.id) || 'unknown';
    const quota = await store.consumeRateLimit(`join:${ip}`, config.joinRatePerMinute, 60_000);
    if (!quota.allowed) {
      sendError(conn, 'RATE_LIMITED', 'You have joined rooms too quickly. Please wait a moment and try again.');
      conn.ws.close(1013, 'join rate limit');
      hub.disconnect(conn);
      dispose(conn);
      return;
    }
    const result = await hub.join(conn, normalizedRoom, normalizedName, color);
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
    const allowedHosts = kind === 'gif' ? ['static.klipy.com'] : ['www.myinstants.com'];
    const safeUrl = (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && allowedHosts.includes(url.hostname);
      } catch { return false; }
    };
    if (!safeUrl(media.url) || (kind === 'gif' && !safeUrl(media.preview ?? ''))) {
      return sendError(conn, ERROR_CODES.INVALID, 'Unsupported media URL');
    }
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
