/**
 * DevChat — extension entrypoint.
 * Activation: sidebar webview view opened, or a vscode:// invite link clicked.
 * The extension host does REST only (create/join room, invite); all realtime
 * traffic lives inside the webview (single WS, single reconnect loop).
 */
import * as vscode from 'vscode';
import { ChatViewProvider } from './views/sidebar/ChatViewProvider';
import { RoomsTreeProvider } from './views/sidebar/RoomsTreeProvider';
import { createRoomCommand } from './commands/createRoom';
import { joinRoomCommand } from './commands/joinRoom';
import { leaveRoomCommand } from './commands/leaveRoom';
import { copyInviteCommand } from './commands/copyInvite';
import { restoreRoom } from './state/session';

export function activate(context: vscode.ExtensionContext): void {
  const chatProvider = new ChatViewProvider(context);
  const roomsTree = new RoomsTreeProvider();

  const roomsTreeView = vscode.window.createTreeView('devchat.roomsView', {
    treeDataProvider: roomsTree,
    showCollapseAll: false,
  });
  chatProvider.setTreeView(roomsTreeView);
  chatProvider.clearUnread();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    roomsTreeView,
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused && chatProvider.isChatVisible()) {
        chatProvider.clearUnread();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devchat.createRoom', () => createRoomCommand(context, chatProvider)),
    vscode.commands.registerCommand('devchat.joinRoom', (code?: string) => joinRoomCommand(context, chatProvider, code)),
    vscode.commands.registerCommand('devchat.leaveRoom', () => leaveRoomCommand(context, chatProvider)),
    vscode.commands.registerCommand('devchat.copyInvite', () => copyInviteCommand(context)),
  );

  // Deep links: vscode://<publisher>.<ext>/join/CODE
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        if (uri.path === '/join' || uri.path.startsWith('/join/')) {
          const code = uri.path.split('/')[2];
          void vscode.commands.executeCommand('devchat.joinRoom', code?.toUpperCase());
        }
      },
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('devchat.serverUrl')) {
        chatProvider.onConfigChanged();
      }
    }),
  );

  // Restore session (room code persists in workspaceState)
  void restoreRoom(context);
}

export function deactivate(): void {
  /* webview WS dies with the webview; nothing to clean up here */
}
