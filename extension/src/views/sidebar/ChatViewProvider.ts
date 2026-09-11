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
  private unreadCount = 0;

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

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.clearUnread();
      }
    });

    view.onDidDispose(() => {
      this.view = undefined;
      this.unreadCount = 0;
    });

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
        case 'incomingMessage': {
          const chatMsg = msg.message;
          if (!chatMsg) break;

          const isVisible = this.view?.visible ?? false;
          const config = getConfig();
          const currentIdentity = await getIdentity(this.context);

          // Update unread badge on activity bar if chat is not visible
          if (!isVisible) {
            this.incrementUnread();
          }

          // Check whether to show toast notification
          const shouldNotify = !isVisible || config.notifications.notifyWhenFocused;
          if (!shouldNotify) break;

          const mode = config.notifications.mode;
          if (mode === 'never') break;

          const textContent = chatMsg.kind === 'text' ? (chatMsg.text ?? '') : '';
          const mentioned = isMentioned(textContent, currentIdentity.name);

          if (mode === 'mentions' && !mentioned) {
            break;
          }

          let body = '';
          if (chatMsg.kind === 'text') {
            body = chatMsg.text || '';
          } else if (chatMsg.kind === 'gif') {
            body = `sent a GIF${chatMsg.media?.title ? `: "${chatMsg.media.title}"` : ''}`;
          } else if (chatMsg.kind === 'audio') {
            body = `played sound${chatMsg.media?.title ? `: "${chatMsg.media.title}"` : ''}`;
          }

          if (body.length > 80) {
            body = body.slice(0, 77) + '…';
          }

          const author = chatMsg.name || 'Someone';
          const title = mentioned ? `DevChat • @${author} mentioned you:` : `DevChat • ${author}:`;
          const toastText = `${title} ${body}`;

          void vscode.window.showInformationMessage(toastText, 'Open Chat').then(async (action) => {
            if (action === 'Open Chat') {
              await vscode.commands.executeCommand('devchat.chatView.focus');
            }
          });
          break;
        }
        case 'memberEvent': {
          const config = getConfig();
          if (!config.notifications.roomEvents) break;
          const isVisible = this.view?.visible ?? false;
          if (isVisible && !config.notifications.notifyWhenFocused) break;

          const name = msg.memberName || 'Someone';
          const actionText = msg.kind === 'joined' ? 'joined the room' : 'left the room';
          void vscode.window.showInformationMessage(`DevChat: ${name} ${actionText}`);
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
          this.clearUnread();
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
            void this.view?.webview.postMessage({ event: 'identity', identity });
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
            void this.view?.webview.postMessage({ event: 'identity', identity });
          }
          break;
        }
      }
    });
  }

  private clearUnread(): void {
    this.unreadCount = 0;
    if (this.view) {
      this.view.badge = undefined;
    }
  }

  private incrementUnread(): void {
    const config = getConfig();
    if (!config.notifications.badge) return;
    this.unreadCount++;
    if (this.view) {
      this.view.badge = {
        value: this.unreadCount,
        tooltip: `${this.unreadCount} unread message${this.unreadCount === 1 ? '' : 's'}`,
      };
    }
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

  /** Called when devchat.serverUrl or other settings change in VS Code. */
  onConfigChanged(): void {
    if (!this.view) return;
    this.view.webview.html = this.getHtml(this.view.webview);
    void this.pushInit();
  }

  /** Called by create/join commands once a new room is active. */
  notifyRoom(code: string): void {
    this.pendingRoom = code;
    this.clearUnread();
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
    this.clearUnread();
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

function isMentioned(text: string, nickname: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes('@all') || lower.includes('@everyone') || lower.includes('@here')) {
    return true;
  }
  if (!nickname) return false;
  const nickLower = nickname.toLowerCase();
  const escaped = nickLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`@${escaped}(?:\\b|[^a-zA-Z0-9_]|$)`, 'i');
  return regex.test(text);
}
