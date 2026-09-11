/** DevChat: Create Room — calls server, stores code, opens chat view. */
import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { createRoom } from '../api/client';
import { getConfig } from '../config';
import { saveRoom } from '../state/session';
import { ChatViewProvider } from '../views/sidebar/ChatViewProvider';

export async function createRoomCommand(
  context: vscodeTypes.ExtensionContext,
  chatProvider: ChatViewProvider,
): Promise<void> {
  try {
    const config = getConfig();
    const info = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'DevChat: creating room…' },
      () => createRoom(config),
    );
    await saveRoom(context, info.code);
    await vscode.commands.executeCommand('devchat.chatView.focus');
    chatProvider.notifyRoom(info.code);
    await vscode.env.clipboard.writeText(info.code);
    void vscode.window.showInformationMessage(`DevChat room ${info.code} created — code copied!`);
  } catch (err) {
    void vscode.window.showErrorMessage(`DevChat: could not create room — ${(err as Error).message}`);
  }
}
