/** Event names + protocol/limit constants shared by server and extension. */

export const WS_PATH = '/ws';

export const MAX_MEMBERS = 50;
export const MESSAGE_HISTORY = 100;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_NAME_LENGTH = 32;

// Rate limits (per WS connection)
export const TEXT_RATE = { limit: 10, windowMs: 5_000 };
export const MEDIA_RATE = { limit: 5, windowMs: 10_000 };
export const RATE_STRIKES_TO_KICK = 3;

// Liveness
export const HEARTBEAT_INTERVAL_MS = 25_000;
export const DEAD_SOCKET_SILENCE_MS = 60_000;
export const TYPING_THROTTLE_MS = 1_000;
export const TYPING_CLEAR_MS = 3_000;

// Room lifecycle
export const EMPTY_ROOM_GRACE_MIN = 15;
export const EXPIRY_WARNING_BEFORE_MIN = 2;

// Reconnect backoff (client)
export const RECONNECT = { baseMs: 1_000, maxMs: 30_000 };

export const ERROR_CODES = {
  INVALID: 'INVALID',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  KICKED: 'KICKED',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Server → client event names (the `type` field on every server frame). */
export const ServerEvents = {
  Welcome: 'welcome',
  MemberJoined: 'member.joined',
  MemberLeft: 'member.left',
  Message: 'message',
  Gif: 'gif',
  Audio: 'audio',
  Typing: 'typing',
  React: 'react',
  Error: 'error',
  RoomExpiring: 'room.expiring',
} as const;

/** Client → server event names. */
export const ClientEvents = {
  Join: 'join',
  Message: 'message',
  Gif: 'gif',
  Audio: 'audio',
  Typing: 'typing',
  React: 'react',
  Leave: 'leave',
} as const;
