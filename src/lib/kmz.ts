import { inflateSync, strFromU8, zipSync } from 'fflate';

export type KmzResult = { kml: string; kmlBytes: Uint8Array } | { error: 'tooLarge' | 'invalid' };

/** Random access to an archive, so a KMZ never has to sit in memory whole. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Uint8Array;
}

export function bytesSource(bytes: Uint8Array): ByteSource {
  return { size: bytes.byteLength, read: (offset, length) => bytes.subarray(offset, offset + length) };
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
// The central directory of a 200 MB archive of photos is a few hundred KB; a
// header claiming more than this is damaged or hostile.
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000;
const u64 = (b: Uint8Array, i: number) => u32(b, i) + u32(b, i + 4) * 0x100000000;

function readExact(source: ByteSource, offset: number, length: number): Uint8Array {
  if (offset < 0 || length < 0 || offset + length > source.size) throw new Error('KMZ read out of range');
  const bytes = source.read(offset, length);
  if (bytes.byteLength !== length) throw new Error('KMZ short read');
  return bytes;
}

type Entry = { name: string; flags: number; method: number; compressedSize: number; size: number; localOffset: number };

function centralDirectory(source: ByteSource): Entry[] {
  // The end record sits in the last 22 bytes plus an archive comment of at most 64 KB.
  const tailLength = Math.min(source.size, 22 + 0xffff + 20);
  const tailStart = source.size - tailLength;
  const tail = readExact(source, tailStart, tailLength);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('KMZ end record missing');
  let count = u16(tail, eocd + 10);
  let dirSize = u32(tail, eocd + 12);
  let dirOffset = u32(tail, eocd + 16);
  if ((count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) && eocd >= 20 && u32(tail, eocd - 20) === ZIP64_LOCATOR) {
    const record = readExact(source, u64(tail, eocd - 20 + 8), 56);
    if (u32(record, 0) !== ZIP64_EOCD) throw new Error('KMZ zip64 record missing');
    count = u64(record, 32);
    dirSize = u64(record, 40);
    dirOffset = u64(record, 48);
  }
  if (dirSize > MAX_DIRECTORY_BYTES) throw new Error('KMZ directory too large');
  const dir = readExact(source, dirOffset, dirSize);
  const entries: Entry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > dir.byteLength || u32(dir, p) !== CENTRAL_ENTRY) throw new Error('KMZ directory damaged');
    const nameLength = u16(dir, p + 28);
    const extraLength = u16(dir, p + 30);
    const entry: Entry = {
      name: strFromU8(dir.subarray(p + 46, p + 46 + nameLength), !(u16(dir, p + 8) & 0x800)),
      flags: u16(dir, p + 8),
      method: u16(dir, p + 10),
      compressedSize: u32(dir, p + 20),
      size: u32(dir, p + 24),
      localOffset: u32(dir, p + 42),
    };
    // Zip64 widens exactly the fields saturated above, in this order.
    let x = p + 46 + nameLength;
    const extraEnd = x + extraLength;
    while (x + 4 <= extraEnd) {
      const id = u16(dir, x);
      const length = u16(dir, x + 2);
      if (id === 0x0001) {
        let f = x + 4;
        if (entry.size === 0xffffffff) { entry.size = u64(dir, f); f += 8; }
        if (entry.compressedSize === 0xffffffff) { entry.compressedSize = u64(dir, f); f += 8; }
        if (entry.localOffset === 0xffffffff) entry.localOffset = u64(dir, f);
      }
      x += 4 + length;
    }
    entries.push(entry);
    p = extraEnd + u16(dir, p + 32);
  }
  return entries;
}

// Mirrors extractKmlFromKmz in supabase/functions/app-agent/track.ts, but reads
// only the directory and the KML entry: the photos, voice notes and video that
// make a KMZ large are never read. fflate inflates into a buffer of exactly the
// declared size, so a header that understates the size truncates the KML rather
// than growing it.
export function readKmlFromKmz(source: ByteSource, maxKmlBytes: number): KmzResult {
  try {
    const kmls = centralDirectory(source).filter((entry) => /\.kml$/i.test(entry.name));
    const entry = kmls.find((item) => /(^|\/)doc\.kml$/i.test(item.name)) || kmls[0];
    if (!entry || entry.flags & 1 || (entry.method !== 0 && entry.method !== 8)) return { error: 'invalid' };
    // Deflate never expands text by more than a fraction of a percent.
    if (entry.size > maxKmlBytes || entry.compressedSize > maxKmlBytes + (maxKmlBytes >> 6) + 1024) return { error: 'tooLarge' };
    const local = readExact(source, entry.localOffset, 30);
    if (u32(local, 0) !== LOCAL_HEADER) return { error: 'invalid' };
    const data = readExact(source, entry.localOffset + 30 + u16(local, 26) + u16(local, 28), entry.compressedSize);
    const kmlBytes = entry.method === 0
      ? data.slice(0, entry.size)
      : inflateSync(data, { out: new Uint8Array(entry.size) });
    return { kml: strFromU8(kmlBytes), kmlBytes };
  } catch (e) {
    console.warn('[KMZ] extract failed:', e);
    return { error: 'invalid' };
  }
}

/** A KMZ holding just the track, for when the original is too large to keep. */
export function trackOnlyKmz(kmlBytes: Uint8Array): Uint8Array {
  return zipSync({ 'doc.kml': [kmlBytes, { level: 6 }] });
}
