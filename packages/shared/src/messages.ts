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
  name: t.String({ minLength: 1, maxLength: 32 }),
  color: hexColor,
  userId: t.Optional(t.String({ maxLength: 64 })),
});

export const MessageEvent = t.Object({
  type: t.Literal('message'),
  text: t.String({ minLength: 1, maxLength: MAX_TEXT_LENGTH }),
});

export const GifEvent = t.Object({
  type: t.Literal('gif'),
  id: t.String(),
  url: t.String(),
  preview: t.String(),
  title: t.Optional(t.String()),
});

export const AudioEvent = t.Object({
  type: t.Literal('audio'),
  id: t.String(),
  url: t.String(),
  title: t.String(),
  duration: t.Optional(t.Number()),
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
  GifEvent,
  AudioEvent,
  TypingEvent,
  ReactEvent,
  LeaveEvent,
]);

export type ClientEventOf = Static<typeof ClientEvent>;
export type JoinPayload = Static<typeof JoinEvent>;
export type MessagePayload = Static<typeof MessageEvent>;
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
