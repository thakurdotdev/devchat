/** Core domain types shared by server and extension. */

export interface Room {
  code: string;
  createdAt: number;
  /** epoch ms — rooms die at this instant even if occupied (hard cap) */
  expiresAt: number;
}

export interface Member {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
}

export type MessageKind = 'text' | 'gif' | 'audio' | 'system';

/**
 * Normalized media attachment — ALWAYS this shape downstream (never raw
 * Klipy / MyInstants JSON). Produced by server/src/utils/adapters.ts.
 */
export interface MediaAttachment {
  kind: 'gif' | 'sound';
  id: string;
  title: string;
  /** what gets rendered in chat: mp4 (preferred) or gif for GIFs, direct mp3 for sounds */
  url: string;
  /** static poster frame for GIFs (picker grid + bubble placeholder) */
  preview?: string;
  /** usually undefined for sounds — MyInstants returns no duration; computed client-side if needed */
  duration?: number;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  kind: MessageKind;
  memberId: string | null; // null for system messages
  name: string;
  color: string;
  text?: string;
  media?: MediaAttachment;
  createdAt: number;
  reactions?: Record<string, string[]>; // emoji → memberIds
}

export interface Invite {
  code: string;
  expiresAt: number;
}
