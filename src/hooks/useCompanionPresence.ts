// Foreground location sharing via verified HTTP requests and server snapshots.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import {
  setLastSelfPresence,
  clearLastSelfPresenceHistory,
  setSharingJourneyId,
  useLastSelfPresence,
  useSharingJourneyId,
  type CompanionPresence,
} from '../lib/companionPresence';
import { acquireBus, releaseBus } from '../lib/companionPresenceBus';
import {
  LocationPublisher,
  LocationRequestError,
} from '../lib/companionLocationTransport';

export function usePresencePublisher(userId: string | null) {
  const journeyId = useSharingJourneyId();
  useEffect(() => {
    setLastSelfPresence(null);
    if (!userId) {
      setSharingJourneyId(null);
      clearLastSelfPresenceHistory();
      return;
    }
    if (!journeyId) return;
    let disposed = false;
    let active =
      AppState.currentState === 'active' || AppState.currentState == null;
    let online = false;
    let generation = 0;
    let starting = false;
    let publisher: LocationPublisher | null = null;
    let watch: Location.LocationSubscription | null = null;
    let latest: CompanionPresence | null = null;
    let lastSent = 0;
    const pause = () => {
      generation++;
      watch?.remove();
      watch = null;
      latest = null;
      lastSent = 0;
      setLastSelfPresence(null);
      const old = publisher;
      publisher = null;
      void old?.stop().catch(() => {}); // An offline device lapses after 40s server time.
    };
    const failure = (error: unknown) => {
      pause();
      if (
        error instanceof LocationRequestError &&
        [401, 403].includes(error.status)
      ) {
        setSharingJourneyId(null);
      }
    };
    const publish = async () => {
      if (
        disposed ||
        !active ||
        !online ||
        !publisher ||
        !latest ||
        Date.now() - lastSent < 8000
      )
        return;
      const current = generation;
      lastSent = Date.now();
      try {
        const acknowledged = await publisher.publish(latest);
        if (!disposed && generation === current && acknowledged)
          setLastSelfPresence(acknowledged);
      } catch (error) {
        if (!disposed && generation === current) failure(error);
      }
    };
    const start = async () => {
      if (disposed || !active || !online || publisher || starting) return;
      starting = true;
      const current = generation;
      const next = new LocationPublisher(journeyId);
      publisher = next;
      try {
        if (!(await next.begin()) || disposed || generation !== current) return;
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
        }).catch(() => null);
        if (disposed || generation !== current) return;
        const receive = (position: Location.LocationObject) => {
          if (disposed || generation !== current || !active || !online) return;
          const { longitude, latitude } = position.coords;
          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            Math.abs(longitude) > 180 ||
            Math.abs(latitude) > 90
          )
            return;
          latest = {
            userId,
            longitude,
            latitude,
            fixedAt: Date.now(),
            seenAt: Date.now(),
          };
          void publish();
        };
        if (cached) receive(cached);
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          receive,
        );
        if (disposed || generation !== current) sub.remove();
        else watch = sub;
      } catch (error) {
        if (!disposed && generation === current) failure(error);
      } finally {
        starting = false;
      }
    };
    let networkGeneration = 0;
    const network = (state: Network.NetworkState) => {
      online =
        state.isConnected === true && state.isInternetReachable !== false;
      if (!online) pause();
      else void start();
    };
    const networkSub = Network.addNetworkStateListener((state) => {
      networkGeneration++;
      network(state);
    });
    const initialNetwork = networkGeneration;
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!disposed && networkGeneration === initialNetwork) network(state);
      })
      .catch(() => {});
    const appSub = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (!active) pause();
      else {
        networkGeneration++;
        const check = networkGeneration;
        void Network.getNetworkStateAsync()
          .then((state) => {
            if (!disposed && check === networkGeneration) network(state);
          })
          .catch(() => {});
      }
    });
    const timer = setInterval(() => {
      if (!publisher) void start();
      else void publish();
    }, 10000);
    return () => {
      disposed = true;
      pause();
      clearInterval(timer);
      appSub.remove();
      networkSub.remove();
    };
  }, [userId, journeyId]);
}

// ---- viewer ----

/**
 * The companions currently sharing in this journey, plus a 30s clock so the
 * caller's stale computation ("x分钟前") advances while presence is quiet.
 * The array identity only changes when the roster or a position actually
 * changed, so a steady group does not churn the map markers.
 */
export function useCompanionLocations(
  journeyId: string | null,
  enabled: boolean,
): { peers: CompanionPresence[]; presenceClock: number } {
  const [peers, setPeers] = useState<CompanionPresence[]>([]);
  // Re-render clock so "x分钟前" advances even while presence is quiet.
  const [, setTick] = useState(0);

  useEffect(() => {
    setPeers([]);
    if (!journeyId || !enabled) return;
    const bus = acquireBus(journeyId);
    setPeers(bus.peers);
    bus.listeners.add(setPeers);
    return () => {
      bus.listeners.delete(setPeers);
      releaseBus(journeyId, bus);
    };
  }, [journeyId, enabled]);

  const hasPeers = peers.length > 0;
  // Hooks must run on every render. Calling useLastSelfPresence() on the
  // right-hand side of `hasPeers || ...` made its execution depend on whether
  // a roster had arrived, which triggered React's hook-order fatal error while
  // opening the shared-location map.
  const selfPresence = useLastSelfPresence();
  // The publisher's own pin has to age on this clock too, and it is the case
  // where a clock matters most: if publishing stalls, no new self presence
  // arrives, so nothing else would ever make the ring go grey.
  const drawn = hasPeers || !!selfPresence;
  useEffect(() => {
    if (!drawn) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [drawn]);

  return {
    peers,
    // Quantised so a re-render that does not cross a 30s boundary keeps the
    // caller's marker memo (and Android's marker bitmap) untouched.
    presenceClock: drawn ? Math.floor(Date.now() / 30_000) : 0,
  };
}
