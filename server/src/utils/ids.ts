/** Room code + id generators. Codes are human-shareable and unguessable. */
import { customAlphabet, nanoid } from 'nanoid';

// No ambiguous chars (0/O, 1/I/L). 12 chars provide ample entropy for
// unauthenticated rooms while remaining easy to copy and paste.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeGen = customAlphabet(CODE_ALPHABET, 12);
const idGen = nanoid;

export function newRoomCode(): string {
  const raw = codeGen();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function newId(): string {
  return idGen(12);
}

export function newHostSecret(): string {
  return idGen(24);
}
