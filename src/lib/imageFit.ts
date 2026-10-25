import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type FittedImage = { uri: string; width: number; height: number; mimeType: 'image/jpeg' };

/**
 * Re-encodes a photo as one JPEG no longer than `maxEdge` on its long side.
 * Vision models read about 1600 px and the wall shows little more, so a phone
 * original is mostly wasted upload. Decoding applies EXIF rotation, so the
 * measured edge is the one displayed. Returns null, leaving the file as is, for
 * images already within `maxEdge` (HEIC aside), animated GIFs and anything that
 * cannot be decoded here.
 */
export async function fitImage(uri: string, maxEdge: number, quality = 0.82): Promise<FittedImage | null> {
  if (/\.gif(?:\?|$)|^data:image\/gif/i.test(uri)) return null;
  const refs: { release(): void }[] = [];
  try {
    const decoded = await ImageManipulator.manipulate(uri).renderAsync();
    refs.push(decoded);
    let image = decoded;
    if (Math.max(decoded.width, decoded.height) > maxEdge) {
      const resize = decoded.width >= decoded.height ? { width: maxEdge } : { height: maxEdge };
      image = await ImageManipulator.manipulate(decoded).resize(resize).renderAsync();
      refs.push(image);
    } else if (!/\.hei[cf](?:\?|$)/i.test(uri)) {
      // Already small: re-encoding would only blur screenshot text and drop PNG transparency.
      return null;
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return { uri: saved.uri, width: saved.width, height: saved.height, mimeType: 'image/jpeg' };
  } catch (error) {
    console.warn('[fitImage] left image as is:', error);
    return null;
  } finally {
    for (const ref of refs) {
      try { ref.release(); } catch { /* already released */ }
    }
  }
}
