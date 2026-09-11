/** Reads workspace settings for the extension host. */
import * as vscode from 'vscode';

export interface NotificationConfig {
  mode: 'all' | 'mentions' | 'never';
  badge: boolean;
  notifyWhenFocused: boolean;
  roomEvents: boolean;
}

export interface ExtensionConfig {
  serverUrl: string;
  nickname: string;
  notifications: NotificationConfig;
}

const DEFAULT_SERVER_URL = 'https://devchatapi.thakur.dev';

export function normalizeServerUrl(raw?: string): string {
  let url = (raw ?? '').trim();
  if (!url) return DEFAULT_SERVER_URL;

  // Auto-prepend protocol if omitted (e.g. "devchatapi.thakur.dev" -> "https://devchatapi.thakur.dev")
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) {
      url = `http://${url}`;
    } else {
      url = `https://${url}`;
    }
  }

  return url.replace(/\/+$/, '');
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('devchat');
  const notifMode = cfg.get<string>('notifications.mode');
  const validMode = notifMode === 'mentions' || notifMode === 'never' ? notifMode : 'all';

  return {
    serverUrl: normalizeServerUrl(cfg.get<string>('serverUrl')),
    nickname: cfg.get<string>('nickname') || '',
    notifications: {
      mode: validMode,
      badge: cfg.get<boolean>('notifications.badge') ?? true,
      notifyWhenFocused: cfg.get<boolean>('notifications.notifyWhenFocused') ?? false,
      roomEvents: cfg.get<boolean>('notifications.roomEvents') ?? true,
    },
  };
}
