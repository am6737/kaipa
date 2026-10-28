// outingMapSnapshots.ts — 时间线卡片的地图底图。
//
// 卡片不常驻真地图：一列几十张原生地图滚动会卡，Android 上还很占内存。每条轨迹
// 第一次出现时临时挂一张不可操作的地图，等它画好截一张图存进缓存目录，以后卡片
// 只显示这张图。同一时间只挂一张地图，其余的先显示纯轨迹，排队等着。
//
//   * 只有在屏幕上或快滚到的卡片才排队，时间线是整列渲染的，不然一进来就要把
//     几十条轨迹全截一遍。
//   * 没网不截：高德加载不出底图也照样截，存下来的是一张灰网格。
//   * 截图压成 2 倍的 JPEG，缓存只留最近的 MAX_SNAPSHOTS 张。
//
// iOS 的截图把起终点标记画在黑底方块上，所以那边不让地图画标记，截图时记下两点在
// 图上的位置，放在同名的 .json 里，卡片自己叠上去。
//
// 截图跟地图样式、标注、深浅色和卡片宽度有关，这些都算进文件名，换了样式就重截。
// 缓存目录系统可以随时清，清了就再截一次。
import { useCallback, useEffect, useReducer, useState, type RefObject } from 'react';
import { Dimensions, type View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const snapshotDir = () => new Directory(Paths.cache, 'outing-maps');
const MAX_SNAPSHOTS = 200;
const JPEG_QUALITY = 0.8;
// 卡片上下各多算半屏，快滚到的先截好。
const NEAR_SCREENS = 0.5;
const VISIBILITY_TICK_MS = 600;

function hash(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// 截图方式改了就加一，旧图换个名字自然不再命中，之后被数量上限清掉。
const SNAPSHOT_VERSION = 7;

export function snapshotKey(parts: (string | number | boolean)[], coords: [number, number][]) {
  const first = coords[0];
  const last = coords[coords.length - 1];
  return hash([SNAPSHOT_VERSION, ...parts, coords.length, first?.join(','), last?.join(',')].join('|'));
}

export type OutingSnapshot = { uri: string; ends?: [number, number][] };

export function cachedSnapshot(key: string): OutingSnapshot | null {
  try {
    const file = new File(snapshotDir(), `${key}.jpg`);
    if (!file.exists) return null;
    const meta = new File(snapshotDir(), `${key}.json`);
    const ends = meta.exists ? (JSON.parse(meta.textSync()) as { ends?: [number, number][] }).ends : undefined;
    return { uri: file.uri, ends };
  } catch {
    return null;
  }
}

/**
 * Re-encodes a fresh native snapshot as a JPEG no wider than `maxWidth` px and
 * keeps it under `key`; the native file is removed either way.
 */
export async function keepSnapshot(key: string, uri: string, maxWidth: number, ends?: [number, number][]): Promise<OutingSnapshot> {
  const raw = new File(uri);
  const refs: { release(): void }[] = [];
  try {
    const decoded = await ImageManipulator.manipulate(uri).renderAsync();
    refs.push(decoded);
    let image = decoded;
    if (decoded.width > maxWidth) {
      image = await ImageManipulator.manipulate(decoded).resize({ width: Math.round(maxWidth) }).renderAsync();
      refs.push(image);
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    const dir = snapshotDir();
    dir.create({ intermediates: true, idempotent: true });
    const kept = new File(dir, `${key}.jpg`);
    if (kept.exists) kept.delete();
    new File(saved.uri).move(kept);
    const meta = new File(dir, `${key}.json`);
    if (ends) meta.write(JSON.stringify({ ends }));
    else if (meta.exists) meta.delete();
    prune(dir);
    return { uri: kept.uri, ends };
  } finally {
    for (const ref of refs) {
      try { ref.release(); } catch { /* already released */ }
    }
    // iOS writes the native snapshot into Documents, which the system never clears.
    try { if (raw.exists) raw.delete(); } catch { /* nothing to clean up */ }
  }
}

/** Keeps the newest MAX_SNAPSHOTS images, with their .json beside them. */
function prune(dir: Directory) {
  try {
    const images = dir.list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.jpg'))
      .map((file) => ({ file, at: file.info().modificationTime ?? 0 }));
    if (images.length <= MAX_SNAPSHOTS) return;
    images.sort((a, b) => b.at - a.at);
    for (const { file } of images.slice(MAX_SNAPSHOTS)) {
      const meta = new File(dir, file.name.replace(/\.jpg$/, '.json'));
      file.delete();
      if (meta.exists) meta.delete();
    }
    // Pre-JPEG versions left PNGs behind.
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name.endsWith('.png')) entry.delete();
    }
  } catch (cause) {
    console.warn('[outingMapSnapshots] prune failed:', cause);
  }
}

// 排队：只有队首的卡片可以挂地图。卡片卸载或截完就出队。
const queue: object[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const leave = (token: object) => {
  const index = queue.indexOf(token);
  if (index >= 0) queue.splice(index, 1);
};

export function useSnapshotTurn(wanted: boolean): [boolean, () => void] {
  const [token] = useState(() => ({}));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!wanted) return;
    queue.push(token);
    listeners.add(rerender);
    notify();
    return () => {
      leave(token);
      listeners.delete(rerender);
      notify();
    };
  }, [token, wanted]);
  const release = useCallback(() => {
    leave(token);
    notify();
  }, [token]);
  return [wanted && queue[0] === token, release];
}

// 时间线在 ScrollView 里，拿不到每张卡片的可见性，就由一个共用的定时器去量还没
// 截图的卡片在窗口里的位置。截完的卡片不再参加，所以平时这个定时器是停的。
const watchers = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function watch(check: () => void) {
  watchers.add(check);
  if (!ticker) ticker = setInterval(() => watchers.forEach((run) => run()), VISIBILITY_TICK_MS);
  check();
  return () => {
    watchers.delete(check);
    if (!watchers.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Whether the view is on screen or within half a screen of it; only measured while `enabled`. */
export function useNearScreen(ref: RefObject<View | null>, enabled: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return watch(() => {
      ref.current?.measureInWindow((_x, y, width, height) => {
        const screen = Dimensions.get('window').height;
        // A hidden tab measures as zero size.
        setNear(width > 0 && height > 0 && y + height > -screen * NEAR_SCREENS && y < screen * (1 + NEAR_SCREENS));
      });
    });
  }, [enabled, ref]);
  return enabled && near;
}
