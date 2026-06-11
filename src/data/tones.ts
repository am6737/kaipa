// tones.ts — photo palette system + deterministic PRNG (ported from the
// prototype's PHOTO_PALETTES + mulberry32 helpers). We render photos as palette
// gradients with a mountain-silhouette overlay, so the look is deterministic and
// fully offline (no Unsplash dependency).

export type Tone =
  | 'ridge'
  | 'forest'
  | 'sand'
  | 'dusk'
  | 'river'
  | 'night'
  | 'moss'
  | 'rock'
  | 'snow';

export const PHOTO_PALETTES: Record<Tone, [string, string, string]> = {
  ridge: ['#7FA9C7', '#B3CDDD', '#E8EEF1'],
  forest: ['#3F6B4A', '#6E9B6F', '#C7D8B8'],
  sand: ['#C9A87A', '#E3CCA2', '#F4E6CC'],
  dusk: ['#5C4A78', '#A47BB0', '#E8C5C5'],
  river: ['#4A7B8F', '#7BA8B5', '#CDE0E2'],
  night: ['#1B2D4A', '#324E78', '#7194C2'],
  moss: ['#2F4A38', '#4F7256', '#9CB68A'],
  rock: ['#3F3A35', '#6D6258', '#A89F92'],
  snow: ['#92A7B8', '#C2D2DC', '#EEF3F6'],
};

export const TONES: Tone[] = [
  'ridge',
  'forest',
  'sand',
  'dusk',
  'river',
  'night',
  'moss',
  'rock',
  'snow',
];

export function paletteFor(tone?: string): [string, string, string] {
  return PHOTO_PALETTES[(tone as Tone) || 'ridge'] || PHOTO_PALETTES.ridge;
}

// ── Deterministic PRNG (string seed -> reproducible stream) ──
export function hashStr(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function toneFromSeed(seed: string): Tone {
  return TONES[hashStr(seed) % TONES.length];
}
