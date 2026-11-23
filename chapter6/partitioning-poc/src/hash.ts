import { createHash } from 'node:crypto';

/**
 * Deterministic Murmur3-inspired 32-bit hash for consistent partition routing across nodes.
 */
export function murmur3Hash32(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * First 2 bytes of MD5 hash (0..65535), matching DDIA Figure 6-3 directly.
 */
export function md5First2Bytes(key: string): number {
  const digest = createHash('md5').update(key).digest();
  return (digest[0] << 8) | digest[1];
}

/**
 * Illustrates DDIA Section 6.2.2 warning: language built-in hashes (e.g., Java Object.hashCode /
 * Ruby Object#hash with randomized per-process seed) can yield different values across processes.
 */
export function perProcessHash(key: string, processSeed: number): number {
  let h = processSeed >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  }
  return h;
}
