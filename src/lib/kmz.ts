import { strFromU8, unzipSync } from 'fflate';

export function extractKmlFromKmz(bytes: Uint8Array): string | null {
  try {
    const entries = unzipSync(bytes);
    const names = Object.keys(entries);
    const docName = names.find((name) => name.toLowerCase() === 'doc.kml');
    const kmlName = docName || names.find((name) => name.toLowerCase().endsWith('.kml'));
    if (!kmlName) return null;
    return strFromU8(entries[kmlName]);
  } catch (e) {
    console.warn('[KMZ] extract failed:', e);
    return null;
  }
}
