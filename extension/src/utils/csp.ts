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
 * (static.klipy.com, www.myinstants.com) — see Risk #2/#3 in the plan —
 * so img-src / media-src need `https:` broadly until CDN hostnames are
 * confirmed stable; connect-src is derived from the configured server URL.
 */
export function cspTag(n: string, serverUrl: string, webviewCspSource: string): string {
  const wsSrc = serverUrl
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
    .replace(/\/+$/, '');
  const connect = [`https:`, `wss:`, wsSrc, serverUrl, webviewCspSource].join(' ');
  return [
    `default-src 'none'`,
    `img-src https: data: ${webviewCspSource}`,
    `media-src https: blob: data:`,
    `script-src ${webviewCspSource} 'nonce-${n}'`,
    `style-src 'unsafe-inline' ${webviewCspSource}`,
    `connect-src ${connect}`,
    `font-src ${webviewCspSource}`,
  ].join('; ');
}
