// Authenticated server snapshots only. No Realtime payload enters this bus.
import { AppState } from 'react-native';
import {
  foldPresenceRoster,
  type CompanionPresence,
} from './companionPresence';
import { locationRequest } from './companionLocationTransport';

export interface PresenceBus {
  refs: number;
  peers: CompanionPresence[];
  listeners: Set<(peers: CompanionPresence[]) => void>;
  stop: () => void;
}
const buses = new Map<string, PresenceBus>();

export function acquireBus(journeyId: string): PresenceBus {
  const existing = buses.get(journeyId);
  if (existing) {
    existing.refs++;
    return existing;
  }
  let disposed = false;
  let generation = 0;
  let foreground =
    AppState.currentState === 'active' || AppState.currentState == null;
  const bus: PresenceBus = {
    refs: 1,
    peers: [],
    listeners: new Set(),
    stop: () => {},
  };
  const notify = (peers: CompanionPresence[]) => {
    const changed = JSON.stringify(peers) !== JSON.stringify(bus.peers);
    bus.peers = peers;
    if (changed) bus.listeners.forEach((listener) => listener(peers));
  };
  let pending = false;
  const poll = async () => {
    if (disposed || !foreground || pending) return;
    pending = true;
    const requestGeneration = generation;
    try {
      const snapshot = await locationRequest(journeyId, 'snapshot');
      if (!disposed && foreground && generation === requestGeneration) {
        notify(foldPresenceRoster([snapshot.peers], Date.now(), bus.peers));
      }
    } catch {
      // Access revoked or network unavailable: discard the trusted snapshot.
      if (generation === requestGeneration) notify([]);
    } finally {
      pending = false;
    }
  };
  const appState = AppState.addEventListener('change', (state) => {
    foreground = state === 'active';
    generation++;
    notify([]);
    if (foreground) void poll();
  });
  const timer = setInterval(() => void poll(), 3000);
  bus.stop = () => {
    disposed = true;
    generation++;
    clearInterval(timer);
    appState.remove();
    notify([]);
  };
  buses.set(journeyId, bus);
  void poll();
  return bus;
}

export function releaseBus(journeyId: string, bus: PresenceBus) {
  bus.refs = Math.max(0, bus.refs - 1);
  if (!bus.refs) {
    bus.stop();
    if (buses.get(journeyId) === bus) buses.delete(journeyId);
  }
}
