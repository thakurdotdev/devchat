/**
 * REST client (extension host side) — only create/join room info.
 * All realtime traffic goes through the WS inside the webview.
 */
interface ConfigLike { serverUrl: string }

export interface RoomInfo {
  code: string;
  expiresAt: number;
  url?: string;
}

export interface RoomStatus {
  code: string;
  exists: boolean;
  memberCount?: number;
  expiresAt?: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createRoom(config: ConfigLike): Promise<RoomInfo> {
  const res = await fetch(`${config.serverUrl}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new ApiError(res.status, `Create room failed (${res.status})`);
  return (await res.json()) as RoomInfo;
}

export async function getRoom(config: ConfigLike, code: string): Promise<RoomStatus> {
  const res = await fetch(`${config.serverUrl}/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return { code, exists: false };
  if (!res.ok) throw new ApiError(res.status, `Room lookup failed (${res.status})`);
  const body = (await res.json()) as { code: string; memberCount: number; expiresAt: number };
  return { code: body.code, exists: true, memberCount: body.memberCount, expiresAt: body.expiresAt };
}
