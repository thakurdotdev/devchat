/** Env parsing — single source of truth for server configuration. */

export interface Config {
  port: number;
  redisUrl: string | null;
  roomTtlMs: number;
  emptyGraceMs: number;
  maxMembers: number;
  messageHistory: number;
  klipyBaseUrl: string;
  myinstantsBaseUrl: string;
  gifCacheTtlSec: number;
  soundCacheTtlSec: number;
  mockMedia: boolean;
}

function int(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export function loadConfig(): Config {
  return {
    port: int("PORT", 3030),
    redisUrl: process.env.REDIS_URL?.trim() || null,
    roomTtlMs: int("ROOM_TTL_HOURS", 24) * 3_600_000,
    emptyGraceMs: int("EMPTY_ROOM_GRACE_MIN", 15) * 60_000,
    maxMembers: int("MAX_MEMBERS", 50),
    messageHistory: int("MESSAGE_HISTORY", 100),
    klipyBaseUrl: process.env.KLIPY_BASE_URL || "https://klipy.thakur.dev",
    myinstantsBaseUrl:
      process.env.MYINSTANTS_BASE_URL || "https://myinstants.thakur.dev",
    gifCacheTtlSec: int("GIF_CACHE_TTL_SEC", 300),
    soundCacheTtlSec: int("SOUND_CACHE_TTL_SEC", 300),
    mockMedia: /^(1|true|yes)$/i.test(process.env.MOCK_MEDIA || ""),
  };
}
