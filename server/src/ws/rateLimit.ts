/**
 * Per-connection token-bucket rate limiting.
 *  - text: 10 msgs / 5 sec
 *  - media (gif/audio): 5 / 10 sec
 * Violations → error event; 3rd strike → kick (Risk-mitigated server-side).
 */
import { ERROR_CODES, RATE_STRIKES_TO_KICK, TEXT_RATE, MEDIA_RATE } from '@devchat/shared';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private text = new Map<string, Bucket>();
  private media = new Map<string, Bucket>();
  private strikes = new Map<string, number>();

  constructor(
    private onKick: (connId: string) => void,
    private onError: (connId: string, code: string, message: string) => void,
  ) {}

  /** Returns true if allowed. */
  consume(connId: string, kind: 'text' | 'media'): boolean {
    const { limit, windowMs } = kind === 'text' ? TEXT_RATE : MEDIA_RATE;
    const buckets = kind === 'text' ? this.text : this.media;
    const now = Date.now();
    let bucket = buckets.get(connId);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      buckets.set(connId, bucket);
    }
    const elapsed = now - bucket.lastRefill;
    if (elapsed > windowMs) {
      bucket.tokens = limit;
      bucket.lastRefill = now;
    } else if (elapsed > 0) {
      // refill proportionally for smoother behavior
      bucket.tokens = Math.min(limit, bucket.tokens + (elapsed / windowMs) * limit);
      bucket.lastRefill = now;
    }
    if (bucket.tokens < 1) {
      return this.strike(connId, kind);
    }
    bucket.tokens -= 1;
    return true;
  }

  private strike(connId: string, kind: 'text' | 'media'): boolean {
    const n = (this.strikes.get(connId) ?? 0) + 1;
    this.strikes.set(connId, n);
    this.onError(
      connId,
      ERROR_CODES.RATE_LIMITED,
      `Slow down — too many ${kind} messages (${n}/${RATE_STRIKES_TO_KICK} strikes)`,
    );
    if (n >= RATE_STRIKES_TO_KICK) {
      this.onKick(connId);
      return false;
    }
    return false;
  }

  dispose(connId: string) {
    this.text.delete(connId);
    this.media.delete(connId);
    this.strikes.delete(connId);
  }
}
