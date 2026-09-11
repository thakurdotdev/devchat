/** DevChat: Leave Room — tells the webview to close the WS, clears state. */
import type * as vscodeTypes from 'vscode';
import { clearRoom } from '../state/session';
import { ChatViewProvider } from '../views/sidebar/ChatViewProvider';

export async function leaveRoomCommand(
  context: vscodeTypes.ExtensionContext,
  chatProvider: ChatViewProvider,
): Promise<void> {
  chatProvider.requestLeave();
  await clearRoom(context);
}
