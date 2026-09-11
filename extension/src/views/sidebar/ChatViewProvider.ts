/**
 * ChatViewProvider — the sidebar webview view. Owns the HTML shell (CSP +
 * nonce), bridges extension host ↔ webview messages, and serves the bundled
 * Preact app (dist/webview.js). The webview owns the WebSocket connection.
 */
import * as vscode from 'vscode';
import { getConfig } from '../../config';
import { store } from '../../state/store';
import { getIdentity, setIdentity, type Identity } from '../../utils/identity';
import { cspTag, nonce } from '../../utils/csp';

export interface WebviewInitPayload {
  serverUrl: string;
  roomCode: string | null;
  identity: Identity;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'devchat.chatView';
  private view?: vscode.WebviewView;
  private pendingRoom: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg?.cmd) {
        case 'ready': {
          await this.pushInit();
          break;
        }
        case 'status': {
          // relayed from webview: connection status + member list for the tree
          store.update({
            status: msg.status,
            members: msg.members ?? [],
            expiresAt: msg.expiresAt ?? null,
          });
          break;
        }
        case 'copyInvite': {
          const code = store.roomCode;
          if (!code) break;
          await vscode.env.clipboard.writeText(code);
          void vscode.window.showInformationMessage(`Room code copied: ${code}`);
          break;
        }
        case 'leave': {
          await vscode.commands.executeCommand('devchat.leaveRoom');
          break;
        }
        case 'toast': {
          if (msg.kind === 'error') void vscode.window.showErrorMessage(`DevChat: ${msg.message}`);
          else if (msg.kind === 'warn') void vscode.window.showWarningMessage(`DevChat: ${msg.message}`);
          else void vscode.window.showInformationMessage(`DevChat: ${msg.message}`);
          break;
        }
        case 'createRoom': {
          await vscode.commands.executeCommand('devchat.createRoom');
          break;
        }
        case 'showJoin': {
          await vscode.commands.executeCommand('devchat.joinRoom');
          break;
        }
        case 'saveName': {
          // First-run nickname prompt — persist the chosen name
          const current = await getIdentity(this.context);
          const name = String(msg.name ?? '').trim().slice(0, 32);
          if (name) {
            const identity: Identity = { ...current, name, isFirstRun: false };
            await this.saveIdentity(identity);
            void this.view?.webview.postMessage({ event: 'identity', identity: { name: identity.name, color: identity.color } });
          }
          break;
        }
        case 'setNickname': {
          const current = await getIdentity(this.context);
          const name = await vscode.window.showInputBox({
            prompt: 'Your DevChat nickname',
            value: current.name,
            ignoreFocusOut: true,
          });
          if (name && name.trim()) {
            const identity = { ...current, name: name.trim().slice(0, 32) };
            await this.saveIdentity(identity);
            void this.view?.webview.postMessage({ event: 'identity', identity: { name: identity.name, color: identity.color } });
          }
          break;
        }
      }
    });
  }

  /** Push init payload (server URL, room, identity) into the webview. */
  async pushInit(): Promise<void> {
    if (!this.view) return;
    const config = getConfig();
    const identity = await getIdentity(this.context);
    const roomCode = this.pendingRoom ?? store.roomCode;
    this.pendingRoom = null;
    await this.view.webview.postMessage({ event: 'init', serverUrl: config.serverUrl, roomCode, identity });
  }

  /** Called by create/join commands once a new room is active. */
  notifyRoom(code: string): void {
    this.pendingRoom = code;
    if (this.view) {
      void this.view.webview.postMessage({
        event: 'room',
        roomCode: code,
        serverUrl: getConfig().serverUrl,
      });
      this.pendingRoom = null;
    }
  }

  /** Tell the webview to disconnect (leaveRoom command). */
  requestLeave(): void {
    void this.view?.webview.postMessage({ event: 'leave' });
  }

  /** Persist identity edits made in the webview UI. */
  async saveIdentity(identity: Identity): Promise<void> {
    await setIdentity(this.context, identity);
  }

  private getHtml(webview: vscode.Webview): string {
    const n = nonce();
    const config = getConfig();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'),
    );
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'codicon.css'),
    );
    const csp = cspTag(n, config.serverUrl, webview.cspSource);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevChat</title>
  <link rel="stylesheet" nonce="${n}" href="${codiconUri}">
  <link rel="stylesheet" nonce="${n}" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
