/**
 * WS event schemas (client↔server contract) — TypeBox schemas so the server
 * can validate every inbound frame, and both sides share exact statics.
 */
import type { Static } from '@sinclair/typebox';
import { Type as t } from '@sinclair/typebox';
import { MAX_TEXT_LENGTH } from './constants';

const hexColor = t.String({ pattern: '^#[0-9a-fA-F]{6}$', default: '#7c5cff' });

// ---------- Client → Server ----------

export const JoinEvent = t.Object({
  type: t.Literal('join'),
  room: t.Optional(t.String({ minLength: 7, maxLength: 14 })),
  name: t.String({ minLength: 1, maxLength: 32 }),
  color: hexColor,
  userId: t.Optional(t.String({ maxLength: 64 })),
});

export const MessageEvent = t.Object({
  type: t.Literal('message'),
  text: t.String({ minLength: 1, maxLength: MAX_TEXT_LENGTH }),
  replyToId: t.Optional(t.String({ maxLength: 128 })),
});

export const EditMessageEvent = t.Object({
  type: t.Literal('message.edit'),
  messageId: t.String({ minLength: 1, maxLength: 128 }),
  text: t.String({ minLength: 1, maxLength: MAX_TEXT_LENGTH }),
});

export const DeleteMessageEvent = t.Object({
  type: t.Literal('message.delete'),
  messageId: t.String({ minLength: 1, maxLength: 128 }),
});

export const PinMessageEvent = t.Object({
  type: t.Literal('message.pin'),
  messageId: t.String({ minLength: 1, maxLength: 128 }),
  pinned: t.Boolean(),
});

export const GifEvent = t.Object({
  type: t.Literal('gif'),
  id: t.String({ minLength: 1, maxLength: 128 }),
  url: t.String({ minLength: 1, maxLength: 2048 }),
  preview: t.String({ minLength: 1, maxLength: 2048 }),
  title: t.Optional(t.String({ maxLength: 160 })),
});

export const AudioEvent = t.Object({
  type: t.Literal('audio'),
  id: t.String({ minLength: 1, maxLength: 128 }),
  url: t.String({ minLength: 1, maxLength: 2048 }),
  title: t.String({ maxLength: 160 }),
  duration: t.Optional(t.Number({ minimum: 0, maximum: 3600 })),
});

export const TypingEvent = t.Object({
  type: t.Literal('typing'),
});

export const ReactEvent = t.Object({
  type: t.Literal('react'),
  messageId: t.String(),
  emoji: t.String({ minLength: 1, maxLength: 8 }),
});

export const LeaveEvent = t.Object({
  type: t.Literal('leave'),
});

export const ClientEvent = t.Union([
  JoinEvent,
  MessageEvent,
  EditMessageEvent,
  DeleteMessageEvent,
  PinMessageEvent,
  GifEvent,
  AudioEvent,
  TypingEvent,
  ReactEvent,
  LeaveEvent,
]);

export type ClientEventOf = Static<typeof ClientEvent>;
export type JoinPayload = Static<typeof JoinEvent>;
export type MessagePayload = Static<typeof MessageEvent>;
export type EditMessagePayload = Static<typeof EditMessageEvent>;
export type DeleteMessagePayload = Static<typeof DeleteMessageEvent>;
export type PinMessagePayload = Static<typeof PinMessageEvent>;
export type GifPayload = Static<typeof GifEvent>;
export type AudioPayload = Static<typeof AudioEvent>;
export type ReactPayload = Static<typeof ReactEvent>;

// ---------- Server → Client (statics for clients to consume) ----------

export interface WelcomePayload {
  you: string; // your memberId
  room: { code: string; expiresAt: number };
  members: Array<{ id: string; name: string; color: string; joinedAt: number }>;
  recentMessages: import('./types').ChatMessage[];
  expiresAt: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ServerFrame {
  type: string;
  [k: string]: unknown;
}
