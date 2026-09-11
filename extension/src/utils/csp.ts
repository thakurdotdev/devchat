/** CSP nonce helpers per VS Code webview security guidelines. */

export function nonce(): string {
  let text = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}

/**
 * Build the CSP meta tag. Media/GIF URLs come from third-party CDNs
 * (static.klipy.com, www.myinstants.com), and WebSocket connections can connect
 * to https/wss production servers or local http/ws dev servers.
 */
export function cspTag(n: string, serverUrl: string, webviewCspSource: string): string {
  const wsSrc = serverUrl
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/\/+$/, '');
  const connect = [`https:`, `wss:`, `http:`, `ws:`, wsSrc, serverUrl, webviewCspSource].join(' ');
  return [
    `default-src 'none'`,
    `img-src https: http: data: blob: ${webviewCspSource}`,
    `media-src https: http: blob: data:`,
    `script-src ${webviewCspSource} 'nonce-${n}'`,
    `style-src 'unsafe-inline' ${webviewCspSource}`,
    `connect-src ${connect}`,
    `font-src ${webviewCspSource}`,
  ].join('; ');
}
