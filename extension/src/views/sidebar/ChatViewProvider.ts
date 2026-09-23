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
  private roomsTreeView?: vscode.TreeView<any>;
  private pendingRoom: string | null = null;
  private unreadCount = 0;
  private pendingMessages = 0;
  private pendingRoomEvents = 0;
  private pendingMentions = 0;
  private latestNotice?: { author: string; preview: string; mentioned: boolean };
  private notificationTimer?: ReturnType<typeof setTimeout>;
  private notificationInFlight = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
  ) {}

  setTreeView(treeView: vscode.TreeView<any>): void {
    this.roomsTreeView = treeView;
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        this.clearUnread();
      }
    });
  }

  public isChatVisible(): boolean {
    return Boolean(this.view?.visible || this.roomsTreeView?.visible);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };

    view.webview.html = this.getHtml(view.webview);

    if (view.visible) {
      this.clearUnread();
    }

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.clearUnread();
      }
    });

    view.onDidDispose(() => {
      this.view = undefined;
      this.clearUnread();
    });

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg?.cmd) {
        case 'ready': {
          this.clearUnread();
          await this.pushInit();
          break;
        }
        case 'markRead': {
          this.clearUnread();
          break;
        }
        case 'setBlurGifs': {
          await vscode.workspace.getConfiguration('devchat').update(
            'media.blurGifs', Boolean(msg.value), vscode.ConfigurationTarget.Global,
          );
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

          const isWebviewFocused = Boolean(msg.isFocused);
          const isVisible = this.isChatVisible();
          const isActivelyChatting = isVisible && isWebviewFocused;

          // If the user is actively chatting in the webview, clear badge and skip notification
          if (isActivelyChatting) {
            this.clearUnread();
            break;
          }

          // Update unread badge on activity bar if chat is not actively visible and focused
          this.incrementUnread();

          const config = getConfig();
          const currentIdentity = await getIdentity(this.context);

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

          this.enqueueNotification({
            kind: 'message',
            author: String(chatMsg.name || 'Someone'),
            preview: truncate(body || 'sent a message', 96),
            mentioned,
          });
          break;
        }
        case 'memberEvent': {
          const config = getConfig();
          if (!config.notifications.roomEvents) break;
          const isVisible = this.isChatVisible();
          if (isVisible && !config.notifications.notifyWhenFocused) break;

          const name = msg.memberName || 'Someone';
          const actionText = msg.kind === 'joined' ? 'joined the room' : 'left the room';
          this.enqueueNotification({ kind: 'roomEvent', author: name, preview: actionText, mentioned: false });
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
          this.clearUnread();
          await vscode.commands.executeCommand('devchat.createRoom');
          break;
        }
        case 'showJoin': {
          this.clearUnread();
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

  private setBadge(count: number): void {
    if (count > 0) {
      const badge: vscode.ViewBadge = {
        value: count,
        tooltip: `${count} unread message${count === 1 ? '' : 's'}`,
      };
      // Primary badge target: TreeView in the devchat container.
      // Native TreeView clears reliably across all VS Code versions (including < 1.137).
      if (this.roomsTreeView) {
        this.roomsTreeView.badge = badge;
      } else if (this.view) {
        this.view.badge = badge;
      }
    } else {
      // Clear badge
      if (this.roomsTreeView) {
        try {
          this.roomsTreeView.badge = { value: 0, tooltip: '' };
        } catch {}
        this.roomsTreeView.badge = undefined;
      }
      if (this.view) {
        try {
          this.view.badge = { value: 0, tooltip: '' };
        } catch {}
        this.view.badge = undefined;
      }
    }
  }

  public clearUnread(): void {
    this.unreadCount = 0;
    this.setBadge(0);
    this.clearPendingNotifications();
  }

  private enqueueNotification(notice: { kind: 'message' | 'roomEvent'; author: string; preview: string; mentioned: boolean }): void {
    if (notice.kind === 'message') this.pendingMessages++;
    else this.pendingRoomEvents++;
    if (notice.mentioned) this.pendingMentions++;
    this.latestNotice = notice;
    if (!this.notificationInFlight && !this.notificationTimer) {
      this.notificationTimer = setTimeout(() => { void this.showPendingNotification(); }, 700);
    }
  }

  private async showPendingNotification(): Promise<void> {
    this.notificationTimer = undefined;
    if (this.notificationInFlight || (!this.pendingMessages && !this.pendingRoomEvents) || !this.latestNotice) return;

    const messages = this.pendingMessages;
    const roomEvents = this.pendingRoomEvents;
    const mentions = this.pendingMentions;
    const latest = this.latestNotice;
    this.pendingMessages = 0;
    this.pendingRoomEvents = 0;
    this.pendingMentions = 0;
    this.latestNotice = undefined;
    this.notificationInFlight = true;

    const total = messages + roomEvents;
    let summary: string;
    if (messages === 1 && roomEvents === 0) {
      summary = latest.mentioned
        ? `@${latest.author} mentioned you: ${latest.preview}`
        : `${latest.author}: ${latest.preview}`;
    } else {
      const activity = messages && roomEvents
        ? `${total} new chat updates`
        : messages
          ? `${messages} new message${messages === 1 ? '' : 's'}`
          : `${roomEvents} room update${roomEvents === 1 ? '' : 's'}`;
      const mentionPrefix = mentions ? `${mentions} mention${mentions === 1 ? '' : 's'} · ` : '';
      summary = `${mentionPrefix}${activity} · Latest: ${latest.author}: ${latest.preview}`;
    }

    try {
      const action = await vscode.window.showInformationMessage(`DevChat · ${summary}`, 'Open Chat');
      if (action === 'Open Chat') {
        this.clearUnread();
        await vscode.commands.executeCommand('devchat.chatView.focus');
      }
    } finally {
      this.notificationInFlight = false;
      if ((this.pendingMessages || this.pendingRoomEvents) && !this.notificationTimer) {
        this.notificationTimer = setTimeout(() => { void this.showPendingNotification(); }, 700);
      }
    }
  }

  private clearPendingNotifications(): void {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = undefined;
    this.pendingMessages = 0;
    this.pendingRoomEvents = 0;
    this.pendingMentions = 0;
    this.latestNotice = undefined;
  }

  private incrementUnread(): void {
    const config = getConfig();
    if (!config.notifications.badge) return;
    this.unreadCount++;
    this.setBadge(this.unreadCount);
  }

  /** Push init payload (server URL, room, identity) into the webview. */
  async pushInit(): Promise<void> {
    if (!this.view) return;
    const config = getConfig();
    const identity = await getIdentity(this.context);
    const roomCode = this.pendingRoom ?? store.roomCode;
    this.pendingRoom = null;
    await this.view.webview.postMessage({ event: 'init', serverUrl: config.serverUrl, roomCode, identity, blurGifs: config.blurGifs });
  }

  /** Called when devchat.serverUrl or other settings change in VS Code. */
  onConfigChanged(): void {
    if (!this.view) return;
    this.view.webview.html = this.getHtml(this.view.webview);
    void this.pushInit();
  }

  /** Push media preferences without rebuilding the webview. */
  onMediaConfigChanged(): void {
    void this.view?.webview.postMessage({ event: 'mediaConfig', blurGifs: getConfig().blurGifs });
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

function truncate(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}
