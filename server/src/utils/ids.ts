/** Room code + id generators. Codes are human-shareable and unguessable. */
import { customAlphabet, nanoid } from 'nanoid';

// No ambiguous chars (0/O, 1/I/L) — codes read aloud cleanly: "KX7P-2MA"
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeGen = customAlphabet(CODE_ALPHABET, 7);
const idGen = nanoid;

export function newRoomCode(): string {
  const raw = codeGen();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function newId(): string {
  return idGen(12);
}

export function newHostSecret(): string {
  return idGen(24);
}
