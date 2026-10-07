/** Env parsing — single source of truth for server configuration. */

export interface Config {
  port: number;
  redisUrl: string | null;
  maxRoomTtlHours: number;
  defaultRoomTtlHours: number;
  maxMembers: number;
  messageHistory: number;
  klipyBaseUrl: string;
  myinstantsBaseUrl: string;
  gifCacheTtlSec: number;
  soundCacheTtlSec: number;
  mockMedia: boolean;
  trustProxy: boolean;
  createRatePerHour: number;
  lookupRatePerMinute: number;
  joinRatePerMinute: number;
  wsConnectionsPerIp: number;
  wsConnectionsGlobal: number;
  mediaRatePerMinute: number;
  wsMessageBytes: number;
  wsFramesPerMinute: number;
  allowedWsOrigins: string[];
}

function int(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : def;
}

export function loadConfig(): Config {
  const maxRoomTtlHours = Math.min(int("MAX_ROOM_TTL_HOURS", 2160), 24 * 365);
  const defaultRoomTtlHours = Math.min(int("ROOM_TTL_HOURS", 24), maxRoomTtlHours);
  return {
    port: int("PORT", 3030),
    redisUrl: process.env.REDIS_URL?.trim() || null,
    maxRoomTtlHours,
    defaultRoomTtlHours,
    maxMembers: int("MAX_MEMBERS", 50),
    messageHistory: int("MESSAGE_HISTORY", 100),
    klipyBaseUrl: process.env.KLIPY_BASE_URL || "https://klipy.thakur.dev",
    myinstantsBaseUrl:
      process.env.MYINSTANTS_BASE_URL || "https://myinstants.thakur.dev",
    gifCacheTtlSec: int("GIF_CACHE_TTL_SEC", 300),
    soundCacheTtlSec: int("SOUND_CACHE_TTL_SEC", 300),
    mockMedia: /^(1|true|yes)$/i.test(process.env.MOCK_MEDIA || ""),
    trustProxy: /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || ""),
    createRatePerHour: int("ROOM_CREATE_RATE_PER_HOUR", 10),
    lookupRatePerMinute: int("ROOM_LOOKUP_RATE_PER_MINUTE", 120),
    joinRatePerMinute: int("ROOM_JOIN_RATE_PER_MINUTE", 120),
    wsConnectionsPerIp: int("WS_CONNECTIONS_PER_IP", 100),
    wsConnectionsGlobal: int("WS_CONNECTIONS_GLOBAL", 5000),
    mediaRatePerMinute: int("MEDIA_RATE_PER_MINUTE", 60),
    wsMessageBytes: int("WS_MESSAGE_BYTES", 16384),
    wsFramesPerMinute: int("WS_FRAMES_PER_MINUTE", 120),
    allowedWsOrigins: (process.env.ALLOWED_WS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
  };
}
