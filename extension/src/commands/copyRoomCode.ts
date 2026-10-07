/** Copy the active room code to the clipboard. */
import * as vscode from 'vscode';
import { store } from '../state/store';

export async function copyRoomCodeCommand(): Promise<void> {
  const code = store.roomCode;
  if (!code) {
    void vscode.window.showWarningMessage('DevChat: you are not in a room yet');
    return;
  }
  await vscode.env.clipboard.writeText(code);
  void vscode.window.showInformationMessage(`Room code copied: ${code}`);
}
