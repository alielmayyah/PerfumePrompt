import { randomUUID } from 'node:crypto';

/** UUID v4. Used for every entity id so ids are portable between drivers. */
export function newId(): string {
  return randomUUID();
}

/** Short, URL-safe, human-scannable suffix for storage filenames. */
export function shortToken(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

/**
 * Filesystem- and URL-safe slug. Decomposes accents with NFKD first so that
 * combining marks are dropped by the alphanumeric filter rather than becoming
 * separators.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
