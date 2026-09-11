/** DevChat: Copy Invite Link — vscode:// deep link or plain URL fallback. */
import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { store } from '../state/store';

export async function copyInviteCommand(context: vscodeTypes.ExtensionContext): Promise<void> {
  const code = store.roomCode;
  if (!code) {
    void vscode.window.showWarningMessage('DevChat: you are not in a room yet');
    return;
  }
  const deepLink = `vscode://devchat.devchat/join/${code}`;
  const plainLink = `${vscode.workspace.getConfiguration('devchat').get<string>('serverUrl')}/#join=${code}`;
  await vscode.env.clipboard.writeText(deepLink.trim());
  void vscode.window.showInformationMessage(`Invite copied: ${deepLink.trim()} (plain URL: ${plainLink})`);
}
