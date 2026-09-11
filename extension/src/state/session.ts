/**
 * Session management (extension host side): which room the user is in,
 * persisted in workspaceState so the sidebar reconnects on reload.
 */
import * as vscode from 'vscode';
import { store } from './store';

const ROOM_KEY = 'devchat.roomCode';

export async function saveRoom(context: vscode.ExtensionContext, code: string): Promise<void> {
  await context.workspaceState.update(ROOM_KEY, code);
  store.update({ roomCode: code });
}

export async function clearRoom(context: vscode.ExtensionContext): Promise<void> {
  await context.workspaceState.update(ROOM_KEY, undefined);
  store.update({
    roomCode: null,
    status: 'disconnected',
    members: [],
    expiresAt: null,
  });
}

export async function restoreRoom(context: vscode.ExtensionContext): Promise<string | null> {
  const code = context.workspaceState.get<string>(ROOM_KEY) ?? null;
  store.update({ roomCode: code });
  return code;
}
