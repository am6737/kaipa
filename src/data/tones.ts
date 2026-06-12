// tones.ts — photo palette system + deterministic PRNG (ported from the
// prototype's PHOTO_PALETTES + mulberry32 helpers). PhotoTile shows a real
// scenery photo (Unsplash CDN, picked deterministically from tone + seed) on
// top of a palette gradient + mountain-silhouette, which doubles as the offline
// fallback when the photo can't load.

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

// ── Real scenery photos (Unsplash CDN), grouped by tone ──
// Ported from the prototype; every id is load-verified. Multiple per tone so
// same-tone items don't repeat — the specific photo is chosen deterministically
// from the seed. The gradient + ridge in PhotoTile is the fallback behind it.
export const PHOTO_POOLS: Record<Tone, string[]> = {
  ridge: ['1500534314209-a25ddb2bd429', '1454496522488-7a8e488e8606', '1470770841072-f978cf4d019e', '1464822759023-fed622ff2c3b'],
  forest: ['1441974231531-c6227db76b6e', '1426604966848-d7adac402bff', '1418065460487-3e41a6c84dc5', '1464822759023-fed622ff2c3b'],
  sand: ['1509316785289-025f5b846b35', '1473580044384-7ba9967e16a0', '1547234935-80c7145ec969', '1444492417251-9c84a5fa18e0'],
  dusk: ['1549880181-56a44cf4a9a5', '1469474968028-56623f02e42e', '1495616811223-4d98c6e9c869', '1470071459604-3b5ec3a7fe05'],
  river: ['1472213984618-c79aaec7fef0', '1439066615861-d1af74d74000', '1470770841072-f978cf4d019e', '1432889490240-84df33d47091'],
  night: ['1419242902214-272b3f66ee7a', '1444703686981-a3abbc4d4fe3'],
  moss: ['1448375240586-882707db888b', '1418065460487-3e41a6c84dc5', '1470071459604-3b5ec3a7fe05', '1426604966848-d7adac402bff'],
  rock: ['1477468572316-36979010099d', '1560710990-9f5d4197b5a2', '1547234935-80c7145ec969', '1500534314209-a25ddb2bd429'],
  snow: ['1454496522488-7a8e488e8606', '1483921020237-2ff51e8e4b22', '1465220183275-1faa863377e3', '1531436040007-7216019112d7', '1611572757951-6b8e7f068942', '1527236278376-a1ed0f95da30', '1507281736509-c6289f1ea0f8'],
};

export function photoUrlFor(tone: string | undefined, seed: string, width = 800): string {
  const pool = PHOTO_POOLS[(tone as Tone) || 'ridge'] || PHOTO_POOLS.ridge;
  const id = pool[hashStr(seed || tone || 'ridge') % pool.length];
  return `https://images.unsplash.com/photo-${id}?fm=jpg&q=72&w=${width}&auto=format&fit=crop`;
}
