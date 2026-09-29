/** Deterministic 32-bit hash for seeded probabilities. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function unitRandom(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

export function pickInRange(seed: string, lo: number, hi: number): number {
  if (hi < lo) throw new Error(`invalid range ${lo}..${hi}`);
  const span = hi - lo + 1;
  return lo + (fnv1a(seed) % span);
}
