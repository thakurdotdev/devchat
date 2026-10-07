/**
 * Session management (extension host side): which room the user is in,
 * persisted in workspaceState so the sidebar reconnects on reload.
 */
import * as vscode from 'vscode';
import { store } from './store';

const ROOM_KEY = 'devchat.roomCode';
const ROOM_NAME_KEY = 'devchat.roomName';
const LAST_ROOM_KEY = 'devchat.lastRoomCode';
const LAST_ROOM_NAME_KEY = 'devchat.lastRoomName';

export async function saveRoom(context: vscode.ExtensionContext, code: string, name = ''): Promise<void> {
  await context.workspaceState.update(ROOM_KEY, code);
  await context.workspaceState.update(ROOM_NAME_KEY, name);
  await context.workspaceState.update(LAST_ROOM_KEY, code);
  await context.workspaceState.update(LAST_ROOM_NAME_KEY, name);
  store.update({ roomCode: code, roomName: name, lastRoomCode: code, lastRoomName: name });
}

export async function clearRoom(context: vscode.ExtensionContext): Promise<void> {
  await context.workspaceState.update(ROOM_KEY, undefined);
  await context.workspaceState.update(ROOM_NAME_KEY, undefined);
  store.update({
    roomCode: null,
    roomName: '',
    status: 'disconnected',
    members: [],
    expiresAt: null,
  });
}

export async function restoreRoom(context: vscode.ExtensionContext): Promise<string | null> {
  const code = context.workspaceState.get<string>(ROOM_KEY) ?? null;
  const name = context.workspaceState.get<string>(ROOM_NAME_KEY) ?? '';
  const lastRoomCode = context.workspaceState.get<string>(LAST_ROOM_KEY) ?? code;
  const lastRoomName = context.workspaceState.get<string>(LAST_ROOM_NAME_KEY) ?? name;
  store.update({ roomCode: code, roomName: name, lastRoomCode, lastRoomName });
  return code;
}
