// useClipboardProduct.ts — watches for a product link the user copied in a
// shop app and recognized in the background, so the gear card can offer it on
// return. Scans happen on resume and once after cold start, never on a timer.
// On iOS a scan is gated behind the pasteboard probe (see modules/clipboard-probe):
// reading the text is the last step, reached only for content that changed and
// looks like it carries a link, because the read is what shows the system prompt.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clipboardProbe } from '../../modules/clipboard-probe';
import { fetchGearLinkPreview, type GearLinkPreview } from '../lib/gearLinkPreview';
import { markProductClipboardSeen, productLinkFromText, wasProductClipboardSeen } from '../lib/clipboardProduct';

export interface ClipboardProduct {
  preview: GearLinkPreview;
  text: string;
}

// Cold start gives the launch (session restore, first data fetch) room to finish.
const STARTUP_DELAY_MS = 1500;
// Android can only read the clipboard once the window has focus; reading a few
// frames after 'active' is the documented workaround.
const ANDROID_FOCUS_DELAY_MS = 400;

const delay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

// iOS pasteboard write counter, as of the last probe. Module level on purpose:
// the count belongs to the pasteboard, not to this hook's instance.
let lastProbeCount: number | null = null;
const PROBE_COUNT_KEY = 'kaipa.gear.clipboardProbeCount.v1';

async function readProbeCount(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PROBE_COUNT_KEY);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
let lastProbeLine = '';

// Dev-only trace, one line per probe so a real-device run reads off a single
// console filter. The clipboard text itself never goes into a log; the host is
// already public. Repeats of one line are the unchanged pasteboard settling on
// the shelf over and over, so they are folded away.
function probeLine(fields: Record<string, string | number | boolean | null>): void {
  if (!__DEV__ || Platform.OS !== 'ios') return;
  const line = Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ');
  if (line === lastProbeLine) return;
  lastProbeLine = line;
  console.info(`[clipboard-probe] ${line}`);
}

function linkHost(link: string): string {
  return /^https?:\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(link)?.[1] ?? '-';
}

interface ProbeOutcome {
  count: number | null;
  prev: number | null;
  link: boolean;
}

/**
 * Whether this iOS scan may read the clipboard text. False unless the pasteboard
 * changed since the last probe and its content looks like it carries a link —
 * both answers come from the probe, which never reads content and so never
 * brings up the paste prompt.
 */
async function iosProbe(): Promise<ProbeOutcome | null> {
  if (!clipboardProbe) {
    // Expo Go, or a binary predating the module: no auto-detect, no prompt.
    // The manual paste entry point still works from there.
    probeLine({ module: 'missing', read: 'no' });
    return null;
  }
  const count = clipboardProbe.changeCount();
  // Persisted so a cold start with an old link still on the pasteboard does not
  // read (and prompt) again. changeCount resets on reboot, which at worst costs
  // one extra probe or one missed card.
  if (lastProbeCount === null) lastProbeCount = await readProbeCount();
  if (count === null || count === lastProbeCount) {
    // Unchanged pasteboard: the quiet majority of resumes end here.
    return { count, prev: lastProbeCount, link: false };
  }
  // Take the count before probing, so the same content is never probed twice —
  // a pasteboard Apple cannot classify still counts as looked at.
  const prev = lastProbeCount;
  lastProbeCount = count;
  AsyncStorage.setItem(PROBE_COUNT_KEY, String(count)).catch(() => {});
  const link = await clipboardProbe.detectLink();
  return { count, prev, link };
}

/**
 * `suppressed` is read at scan time: true while anything is on screen that the
 * card should not interrupt (see the caller for the exact gates).
 */
export function useClipboardProduct(suppressed: () => boolean): {
  product: ClipboardProduct | null;
  dismiss: () => void;
} {
  const [product, setProduct] = useState<ClipboardProduct | null>(null);
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  const productRef = useRef(product);
  productRef.current = product;
  const scanning = useRef(false);
  const lastState = useRef(AppState.currentState);

  const scan = useCallback(async () => {
    if (scanning.current || productRef.current) return;
    if (AppState.currentState !== 'active') return;
    if (suppressedRef.current()) return;
    scanning.current = true;
    try {
      if (Platform.OS === 'android') await delay(ANDROID_FOCUS_DELAY_MS);
      let text = '';
      if (Platform.OS === 'ios') {
        const probe = await iosProbe();
        if (!probe?.link) {
          if (probe) probeLine({ count: probe.count, prev: probe.prev, link: probe.link, read: 'no' });
          return;
        }
        // The one read of the whole flow: the system paste prompt may appear here.
        text = await Clipboard.getStringAsync();
        probeLine({ count: probe.count, prev: probe.prev, link: probe.link, read: 'yes', host: linkHost(productLinkFromText(text)) });
      } else {
        text = await Clipboard.getStringAsync();
      }
      const link = productLinkFromText(text);
      if (!link) return;
      if (await wasProductClipboardSeen(text)) return;
      let preview: GearLinkPreview;
      try {
        preview = await fetchGearLinkPreview(link, text);
      } catch {
        // Anything but a fresh successful recognition stays silent, and the
        // same failing text is not retried on the next resume.
        await markProductClipboardSeen(text);
        return;
      }
      if (AppState.currentState !== 'active') return;
      await markProductClipboardSeen(text);
      setProduct({ preview, text });
    } catch {
      // Clipboard read failures are not actionable; never surface them.
    } finally {
      scanning.current = false;
    }
  }, []);

  useEffect(() => {
    const startup = setTimeout(() => { void scan(); }, STARTUP_DELAY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      const previous = lastState.current;
      lastState.current = state;
      if (state === 'active' && (previous === 'background' || previous === 'inactive')) void scan();
    });
    return () => {
      clearTimeout(startup);
      subscription.remove();
    };
  }, [scan]);

  return { product, dismiss: useCallback(() => setProduct(null), []) };
}
