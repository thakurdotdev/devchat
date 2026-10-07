/** Resolve the transport peer by default. Forwarded headers are trusted only
 * when the operator explicitly enables TRUST_PROXY behind a trusted proxy. */
export function clientIp(request: Request, server: unknown, trustProxy: boolean): string {
  const headers = request.headers;
  if (trustProxy) {
    const forwarded = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded && forwarded.length <= 64) return forwarded;
  }
  const ipServer = server as { requestIP?: (request: Request) => { address?: string } | null } | null;
  return ipServer?.requestIP?.(request)?.address || 'unknown';
}

export function normalizeIp(value: string | undefined): string {
  return (value || 'unknown').replace(/^::ffff:/i, '').slice(0, 64);
}
