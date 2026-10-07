/** DevChat: Leave Room — tells the webview to close the WS, clears state. */
import type * as vscodeTypes from 'vscode';
import * as vscode from 'vscode';
import { clearRoom } from '../state/session';
import { store } from '../state/store';
import { ChatViewProvider } from '../views/sidebar/ChatViewProvider';

export async function leaveRoomCommand(
  context: vscodeTypes.ExtensionContext,
  chatProvider: ChatViewProvider,
): Promise<void> {
  if (!store.roomCode) return;
  const choice = await vscode.window.showWarningMessage(
    `Leave ${store.state.roomName ? `“${store.state.roomName}”` : 'this room'}? You can rejoin with its room code.`,
    { modal: true },
    'Leave room',
  );
  if (choice !== 'Leave room') return;
  chatProvider.requestLeave();
  await clearRoom(context);
}
