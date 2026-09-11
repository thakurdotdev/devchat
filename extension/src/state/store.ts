/**
 * Global extension-host state: a tiny emitter + the current session
 * (room code, connection status relayed from the webview, members).
 */
import * as vscode from 'vscode';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface MemberLite {
  id: string;
  name: string;
  color: string;
}

export interface SessionState {
  roomCode: string | null;
  status: ConnectionStatus;
  members: MemberLite[];
  expiresAt: number | null;
}

type Listener = () => void;

class Emitter {
  private listeners = new Set<Listener>();
  subscribe(fn: Listener): vscode.Disposable {
    this.listeners.add(fn);
    return new vscode.Disposable(() => this.listeners.delete(fn));
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
}

export class GlobalStore {
  readonly changes = new Emitter();
  state: SessionState = { roomCode: null, status: 'disconnected', members: [], expiresAt: null };

  update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.changes.emit();
  }

  get roomCode() {
    return this.state.roomCode;
  }
}

export const store = new GlobalStore();
