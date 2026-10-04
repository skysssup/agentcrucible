/** Deterministic 32-bit FNV-1a hash used for seeded fault decisions. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * FNV-1a followed by the MurmurHash3 finalizer. Without the finalizer the low bits of FNV-1a
 * depend only on the low bits of each character, so small ranges ignored most of the seed.
 */
function seededHash(input: string): number {
  let h = fnv1a(input);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic value in [0, 1). */
export function unitRandom(seed: string): number {
  return seededHash(seed) / 0x1_0000_0000;
}

/** Deterministic integer in [lo, hi]. */
export function pickInRange(seed: string, lo: number, hi: number): number {
  if (hi < lo) throw new Error(`invalid range ${lo}..${hi}`);
  return lo + Math.floor(unitRandom(seed) * (hi - lo + 1));
}
