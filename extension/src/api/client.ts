/**
 * REST client (extension host side) — only create/join room info.
 * All realtime traffic goes through the WS inside the webview.
 */
interface ConfigLike { serverUrl: string }

export interface RoomInfo {
  code: string;
  name?: string;
  expiresAt: number;
  ttlHours: number;
  durable: boolean;
  url?: string;
}

export interface RoomStatus {
  code: string;
  name?: string;
  exists: boolean;
  memberCount?: number;
  expiresAt?: number;
}

export interface RoomPolicy {
  defaultTtlHours: number;
  maxTtlHours: number;
  durable: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createRoom(config: ConfigLike, ttlHours: number, name = ''): Promise<RoomInfo> {
  const res = await fetch(`${config.serverUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ttlHours, name }),
  });
  if (!res.ok) {
    let message = `Create room failed (${res.status})`;
    try {
      const body = await res.json() as { message?: string };
      if (body.message) message = body.message;
    } catch { /* preserve status fallback */ }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as RoomInfo;
}

export async function getRoomPolicy(config: ConfigLike): Promise<RoomPolicy> {
  const res = await fetch(`${config.serverUrl}/api/rooms/policy`);
  if (!res.ok) throw new ApiError(res.status, `Room settings unavailable (${res.status})`);
  return (await res.json()) as RoomPolicy;
}

export async function getRoom(config: ConfigLike, code: string): Promise<RoomStatus> {
  const res = await fetch(`${config.serverUrl}/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return { code, exists: false };
  if (!res.ok) throw new ApiError(res.status, `Room lookup failed (${res.status})`);
  const body = (await res.json()) as { code: string; name?: string; memberCount: number; expiresAt: number };
  return { code: body.code, name: body.name, exists: true, memberCount: body.memberCount, expiresAt: body.expiresAt };
}
