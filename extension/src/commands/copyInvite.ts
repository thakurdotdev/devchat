/** DevChat: Copy Invite Link — copies the room code to clipboard. */
import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { store } from '../state/store';

export async function copyInviteCommand(context: vscodeTypes.ExtensionContext): Promise<void> {
  const code = store.roomCode;
  if (!code) {
    void vscode.window.showWarningMessage('DevChat: you are not in a room yet');
    return;
  }
  await vscode.env.clipboard.writeText(code);
  void vscode.window.showInformationMessage(`Room code copied: ${code}`);
}
