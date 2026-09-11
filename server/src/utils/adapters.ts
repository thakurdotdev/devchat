/**
 * Adapters — normalize raw Klipy / MyInstants payloads into the shared shape.
 * All downstream code (WS payloads, webview, history) consumes ONLY these
 * normalized shapes, so upstream format drift never leaks past this file.
 */
import type { MediaAttachment } from '@devchat/shared'; // eslint-disable-line @typescript-eslint/no-unused-vars

// ---------- Raw upstream shapes (verified against live docs) ----------

export interface KlipyRawItem {
  id: string;
  title: string;
  url: string; // Klipy *page* link — not embeddable, never sent to chat
  preview: string; // static JPG thumbnail → picker grid
  gif: string; // direct animated GIF
  mp4?: string; // lighter video version → prefer for sent message (Risk #3)
}

export interface MyInstantsRawItem {
  id: string;
  name: string;
  url: string; // direct mp3 on www.myinstants.com
}

// ---------- Normalized shapes ----------

export interface NormalizedGif {
  id: string;
  title: string;
  preview: string;
  url: string;
  kind: 'gif';
}

export interface NormalizedSound {
  id: string;
  title: string;
  url: string;
  kind: 'sound';
  duration?: number;
}

export function adaptKlipyItem(raw: KlipyRawItem): NormalizedGif {
  return {
    id: raw.id,
    title: raw.title,
    preview: raw.preview,
    url: raw.mp4 ?? raw.gif, // prefer mp4 (smaller), fall back to gif
    kind: 'gif',
  };
}

export function adaptMyInstantsItem(raw: MyInstantsRawItem): NormalizedSound {
  return {
    id: raw.id,
    title: raw.name,
    url: raw.url,
    kind: 'sound',
    // NOTE: MyInstants returns no duration — leave undefined (Risk #4).
    // Clients may compute it from <audio> loadedmetadata if the UI needs it.
  };
}

/** Klipy list responses: `{ page, type, data: [...] | ... }` */
export function adaptKlipyResponse(payload: { data?: unknown }): NormalizedGif[] {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.filter(isKlipyItem).map(adaptKlipyItem);
}

/** MyInstants list responses: `{ page, data: [...] }` */
export function adaptMyInstantsResponse(payload: { data?: unknown }): NormalizedSound[] {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.filter(isMyInstantsItem).map(adaptMyInstantsItem);
}

function isKlipyItem(x: unknown): x is KlipyRawItem {
  const o = x as Record<string, unknown>;
  return typeof o?.id === 'string' && typeof o?.title === 'string'
    && typeof o?.preview === 'string' && typeof o?.gif === 'string';
}

function isMyInstantsItem(x: unknown): x is MyInstantsRawItem {
  const o = x as Record<string, unknown>;
  return typeof o?.id === 'string' && typeof o?.name === 'string' && typeof o?.url === 'string';
}
