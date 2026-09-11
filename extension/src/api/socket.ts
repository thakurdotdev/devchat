/**
 * WS client that runs INSIDE the webview (decision §4.1): one socket, one
 * reconnect loop, no message-passing overhead with the extension host.
 * - exponential backoff 1s → 2s → 4s … max 30s
 * - heartbeat ping every 25s (server kills sockets silent > 60s)
 * - server re-sends `welcome` (with recentMessages) on reconnect → client
 *   dedupes by message id
 */
import { HEARTBEAT_INTERVAL_MS, RECONNECT } from '@devchat/shared';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SocketIdentity {
  name: string;
  color: string;
}

export interface SocketCallbacks {
  onFrame: (frame: Record<string, unknown>) => void;
  onStatus: (status: SocketStatus) => void;
}

export class ChatSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;

  constructor(
    private readonly serverUrl: string,
    private readonly room: string,
    private readonly identity: SocketIdentity,
    private readonly cb: SocketCallbacks,
  ) {}

  get status(): SocketStatus {
    if (this.ws?.readyState === WebSocket.OPEN) return 'connected';
    if (this.closedByUser) return 'disconnected';
    return this.attempts > 0 ? 'reconnecting' : 'connecting';
  }

  private wsUrl(): string {
    const base = this.serverUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
    const q = new URLSearchParams({ room: this.room, name: this.identity.name, color: this.identity.color });
    return `${base}/ws?${q.toString()}`;
  }

  connect(): void {
    if (this.closedByUser) return;
    if (!this.serverUrl) {
      this.setStatus('error');
      return;
    }
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    try {
      this.ws = new WebSocket(this.wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('connected');
      this.startHeartbeat();
      // If the server didn't pick up query params, send an explicit join.
      this.ws?.send(JSON.stringify({ type: 'join', name: this.identity.name, color: this.identity.color }));
    };

    this.ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        this.cb.onFrame(frame);
      } catch {
        /* non-JSON frame — ignore */
      }
    };

    this.ws.onclose = (ev) => {
      this.stopHeartbeat();
      if (this.closedByUser) return;
      if (ev.code === 1008 || ev.code === 4403) {
        // kicked / rejected — do not hammer the server
        this.setStatus('error');
        this.closedByUser = true;
        return;
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.stopHeartbeat();
      this.setStatus(this.attempts > 0 ? 'reconnecting' : 'error');
    };
  }

  send(frame: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    try {
      this.ws?.send(JSON.stringify({ type: 'leave' }));
    } catch {
      /* already dead */
    }
    try {
      this.ws?.close(1000, 'bye');
    } catch {
      /* already dead */
    }
    this.ws = null;
    this.setStatus('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    const delay = Math.min(RECONNECT.baseMs * 2 ** this.attempts, RECONNECT.maxMs);
    this.attempts += 1;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private setStatus(s: SocketStatus): void {
    this.cb.onStatus(s);
  }
}
