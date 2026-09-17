// These exact public CDN hosts are operator-controlled, not arbitrary domains
// supplied by a model. Never expand this to suffix matching or follow redirects.
const DOWNLOAD_HOSTS = new Set(['a.zdmimg.com', 'qneimg.smzdm.com', 'down-files.2bulu.com']);
const MAX_IMAGE_BYTES = 4_000_000;

export async function guideImageInput(urlInput: string, request: typeof fetch = fetch): Promise<string> {
  const url = new URL(urlInput);
  if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname) || url.username || url.password || url.port) return urlInput;
  const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('Public guide image could not be downloaded');
  }
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime || '') || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body.cancel();
    throw new Error('Unsupported or oversized guide image');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_IMAGE_BYTES) throw new Error('Guide image exceeds byte limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const matches = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!matches) throw new Error('Guide image signature does not match its media type');
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
