// trailOverlays.ts — tracks laid over the 徒步导航 map (两步路's 叠加).
//
// Any number of the walker's own tracks can be shown next to the line being
// followed: a variant to switch to, last year's walk, a friend's GPX. They are
// only drawn — progress, off-route and voice still follow the one planned
// route. The choice outlives a recording and a kill, since it is usually made
// at home with signal and needed on the mountain without.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kaipa.trail.overlays.v1';

let ids: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function set(next: string[]) {
  ids = next;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

export function subscribeTrailOverlays(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void AsyncStorage.getItem(KEY).then((raw) => {
      const stored = raw ? JSON.parse(raw) as unknown : null;
      if (Array.isArray(stored) && !ids.length) {
        ids = stored.filter((id): id is string => typeof id === 'string');
        listeners.forEach((each) => each());
      }
    }).catch(() => undefined);
  }
  return () => listeners.delete(listener);
}

export function getTrailOverlays(): string[] {
  return ids;
}

/** Replaces the whole choice; the 叠加轨迹 sheet commits its draft this way. */
export function setTrailOverlays(next: string[]) {
  if (next.length === ids.length && next.every((id, index) => id === ids[index])) return;
  set(next);
}

// ─── label layers ────────────────────────────────────────────────────────────
// The route card's two map switches, for the trail map: kilometre labels on the
// followed line, and the named waypoints of it and of the overlays. Kept apart
// from the route card's own settings, since a busy map on the mountain and a
// browse at home are different calls. Both start on.

const LAYERS_KEY = 'kaipa.trail.layers.v1';

export interface TrailLayers {
  km: boolean;
  waypoints: boolean;
}

let layers: TrailLayers = { km: true, waypoints: true };
let layersLoaded = false;
const layerListeners = new Set<() => void>();

export function subscribeTrailLayers(listener: () => void): () => void {
  layerListeners.add(listener);
  if (!layersLoaded) {
    layersLoaded = true;
    void AsyncStorage.getItem(LAYERS_KEY).then((raw) => {
      const stored = raw ? JSON.parse(raw) as Partial<TrailLayers> | null : null;
      if (!stored) return;
      layers = {
        km: typeof stored.km === 'boolean' ? stored.km : layers.km,
        waypoints: typeof stored.waypoints === 'boolean' ? stored.waypoints : layers.waypoints,
      };
      layerListeners.forEach((each) => each());
    }).catch(() => undefined);
  }
  return () => layerListeners.delete(listener);
}

export function getTrailLayers(): TrailLayers {
  return layers;
}

export function setTrailLayer(key: keyof TrailLayers, on: boolean) {
  if (layers[key] === on) return;
  layers = { ...layers, [key]: on };
  layerListeners.forEach((listener) => listener());
  void AsyncStorage.setItem(LAYERS_KEY, JSON.stringify(layers)).catch(() => undefined);
}
