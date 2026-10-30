// clipboardProduct.ts — decides whether a clipboard dump is a product share
// from a supported shop, and remembers which dumps we already acted on so the
// recognition card shows at most once per copied text.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstLink } from '../components/gear/gearRecognition';

const PRODUCT_HOSTS = ['taobao.com', 'tmall.com', 'tb.cn', 'jd.com', '3.cn', 'jd.hk', 'dewu.com', 'dw4.co', 'douyin.com'];

const SEEN_KEY = 'kaipa.gear.clipboardProductSeen.v1';
const SEEN_LIMIT = 20;

function linkHost(link: string): string {
  const match = /^https?:\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(link);
  return match ? match[1].toLowerCase() : '';
}

/** The share link inside `text`, but only when its host belongs to a supported platform. */
export function productLinkFromText(text: string): string {
  const link = firstLink(text);
  if (!link) return '';
  const host = linkHost(link);
  if (!host) return '';
  if (!PRODUCT_HOSTS.some((supported) => host === supported || host.endsWith(`.${supported}`))) return '';
  // v.douyin.com also shortens video shares; only mall shares carry the 【抖音商城】 tag.
  if ((host === 'douyin.com' || host.endsWith('.douyin.com')) && !text.includes('【抖音商城】')) return '';
  return link;
}

/** Short stable id for one clipboard dump: FNV-1a over the text plus its length. */
export function clipboardFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}.${hash.toString(36)}`;
}

async function readSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function wasProductClipboardSeen(text: string): Promise<boolean> {
  const fingerprint = clipboardFingerprint(text);
  return (await readSeen()).includes(fingerprint);
}

/** Call when a product text was shown, dismissed, or failed once: it never pops again. */
export async function markProductClipboardSeen(text: string): Promise<void> {
  const fingerprint = clipboardFingerprint(text);
  const seen = (await readSeen()).filter((entry) => entry !== fingerprint);
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([fingerprint, ...seen].slice(0, SEEN_LIMIT)));
  } catch {
    // Storage failures only cost a repeated card, never correctness.
  }
}
