/** DevChat: Join Room — input box for code (also used by the URI handler). */
import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { getRoom } from '../api/client';
import { getConfig } from '../config';
import { saveRoom } from '../state/session';
import { ChatViewProvider } from '../views/sidebar/ChatViewProvider';

export async function joinRoomCommand(
  context: vscodeTypes.ExtensionContext,
  chatProvider: ChatViewProvider,
  presetCode?: string,
): Promise<void> {
  const config = getConfig();
  let code = presetCode?.trim().toUpperCase();

  if (!code) {
    code = await vscode.window.showInputBox({
      prompt: 'Enter a DevChat room code (e.g. H4K8-Q2MX-7D5P)',
      placeHolder: 'H4K8-Q2MX-7D5P',
      ignoreFocusOut: true,
      validateInput: (v) => (/^(?:[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{3}|[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4})$/i.test(v.trim()) ? null : 'Enter a valid DevChat room code.'),
    });
    if (!code) return; // cancelled
    code = code.trim().toUpperCase();
  }

  try {
    const status = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `DevChat: joining ${code}…` },
      () => getRoom(config, code!),
    );
    if (!status.exists) {
      void vscode.window.showErrorMessage(`DevChat: room ${code} does not exist (or expired)`);
      return;
    }
    await saveRoom(context, code!, status.name ?? '');
    await vscode.commands.executeCommand('devchat.chatView.focus');
    chatProvider.notifyRoom(code!, status.name ?? '');
    void vscode.window.showInformationMessage(`DevChat: joining room ${code}`);
  } catch (err) {
    void vscode.window.showErrorMessage(`DevChat: could not reach server — ${(err as Error).message}`);
  }
}
