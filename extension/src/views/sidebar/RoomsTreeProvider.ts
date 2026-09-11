/**
 * RoomsTreeProvider — activity-bar tree showing connection status,
 * current room + expiry, and the live member list (fed from the webview).
 */
import * as vscode from 'vscode';
import { store } from '../../state/store';

type Node = vscode.TreeItem;

export class RoomsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor() {
    store.changes.subscribe(() => this._onDidChange.fire());
  }

  getTreeItem(el: Node): vscode.TreeItem {
    return el;
  }

  getChildren(): Node[] {
    const s = store.state;
    const items: Node[] = [];
    const statusIcon: Record<string, string> = {
      connected: '$(circle-filled)',
      connecting: '$(sync~spin)',
      reconnecting: '$(sync~spin)',
      error: '$(error)',
      disconnected: '$(circle-outline)',
    };

    items.push(item(`Room: ${s.roomCode ?? 'none'}`, s.roomCode ? '$(comment-discussion)' : '$(plus)', s.roomCode ? undefined : 'Run "DevChat: Create Room" or "Join Room"'));

    const statusLine = `${statusIcon[s.status] ?? '$(circle-outline)'} ${s.status}`;
    const minutes = s.expiresAt ? Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000)) : null;
    items.push(item(statusLine + (s.status === 'connected' && minutes !== null ? ` · expires in ${minutes}m` : ''), undefined, 'Live connection status'));

    if (s.members.length > 0) {
      const memberItems = s.members.map((m) => item(`$(circle-small-filled) ${m.name}`, undefined, `Member ${m.name}`));
      const parent = item(`Members (${s.members.length})`, '$(organization)', 'People currently online');
      return [...items, parent, ...memberItems];
    }
    return items;
  }
}

function item(label: string, icon?: string, tooltip?: string): vscode.TreeItem {
  const t = new vscode.TreeItem(label);
  if (icon) t.iconPath = new vscode.ThemeIcon(icon.replace('$(', '').replace(')', ''));
  if (tooltip) t.tooltip = tooltip;
  t.collapsibleState = vscode.TreeItemCollapsibleState.None;
  return t;
}
