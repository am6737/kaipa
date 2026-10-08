import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { planJourneyDirections, type PlannedLeg } from '../lib/amapGeocoding';
import { composeJourneyLegGeometry, trackAccessReachesEndpoints, type JourneyLeg } from '../lib/journeyStops';
import type { Coordinate } from '../lib/routeSegments';

// Keyed by directed coordinate pairs rather than row ids: edits reuse unchanged
// pairs and plan new neighbours. The server caches on the same identity.
const plannedGeometries = new Map<string, Coordinate[]>();

function legSignature(leg: JourneyLeg) {
  const point = ([lng, lat]: Coordinate) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
  return `${leg.trackBridge ? "access-v3:" : ""}${leg.mode}:${point(leg.directionFrom ?? leg.from)}:${point(leg.directionTo ?? leg.to)}`;
}

// Without this a cold start re-planned every leg of every journey, because the
// only other cache lives in one function container and dies with it. A plan is
// geography rather than user data, so one unsuffixed key serves every account on
// the device; roads do not move, so it ages out by eviction instead of a TTL, and
// a place that gets re-picked simply asks under a new signature.
const GEOMETRY_CACHE_KEY = '@kaipa/journey-leg-geometry';
const GEOMETRY_CACHE_LIMIT = 400;
let hydrated = false;
let hydration: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function hydrate(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(GEOMETRY_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const entries = JSON.parse(raw) as Array<[string, Coordinate[]]>;
        // Stored oldest first, so reading it back in order keeps the eviction
        // order meaningful across launches.
        entries.forEach(([signature, coordinates]) => {
          if (typeof signature === 'string' && Array.isArray(coordinates)) {
            plannedGeometries.set(signature, coordinates);
          }
        });
      })
      .catch(() => {})
      .finally(() => {
        hydrated = true;
      });
  }
  return hydration;
}

function remember(signature: string, coordinates: Coordinate[]) {
  plannedGeometries.delete(signature);
  plannedGeometries.set(signature, coordinates);
  while (plannedGeometries.size > GEOMETRY_CACHE_LIMIT) {
    const oldest = plannedGeometries.keys().next().value;
    if (oldest === undefined) break;
    plannedGeometries.delete(oldest);
  }
  // One journey open plans a dozen legs and each snapshot is a few hundred
  // coordinates, so the burst is collapsed into a single trailing write.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(GEOMETRY_CACHE_KEY, JSON.stringify([...plannedGeometries])).catch(() => {});
  }, 400);
}

/**
 * Road geometry for the legs between itinerary stops. Legs whose plan has not
 * arrived (or failed) are simply absent from the result, which is what lets the
 * map draw them as a plain dashed link instead of a road.
 */
export function useJourneyLegGeometry(legs: JourneyLeg[], enabled: boolean): Record<string, Coordinate[]> {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(hydrated);
  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    void hydrate().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  // Describe the chain, not the cache misses. Publishing a completed batch
  // must not abort the remaining batches or reset their retry budget.
  const requestKey = useMemo(() => {
    if (!enabled || !ready) return '';
    return [...new Set(legs.filter((leg) => !leg.recordedGeometry && (!leg.pendingTrack || leg.trackBridge)).map(legSignature))].join('|');
  }, [enabled, legs, ready]);

  useEffect(() => {
    if (!requestKey) return;
    const bridgeLegs = new Map(legs.filter((leg) => leg.trackBridge).map((leg) => [legSignature(leg), leg]));
    const requested = new Map(legs
      .filter((leg) => !leg.recordedGeometry && (!leg.pendingTrack || leg.trackBridge) && !plannedGeometries.has(legSignature(leg)))
      .map((leg) => [legSignature(leg), {
        id: legSignature(leg),
        mode: leg.mode,
        trackAccess: leg.trackBridge === true,
        from: leg.directionFrom ?? leg.from,
        to: leg.directionTo ?? leg.to,
      }]));
    if (!requested.size) return;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // The final delay lets the server's minute-long planning budget recover.
    // Bound the retries so unavailable roads/services cannot cause a hot loop.
    const retryDelays = [2_000, 10_000, 60_000];
    const applyLeg = (leg: PlannedLeg) => {
      const bridge = bridgeLegs.get(leg.id);
      if (leg.coordinates && leg.coordinates.length >= 2
        && (!bridge || trackAccessReachesEndpoints(bridge, leg.actualFrom, leg.actualTo))) {
        remember(leg.id, leg.coordinates);
        requested.delete(leg.id);
        if (!controller.signal.aborted) setRevision((value) => value + 1);
      } else if (leg.attempted === true || leg.coordinates) {
        // A definite no-route answer stops this attempt, but is not a permanent
        // device-wide ban. An edited/reopened chain can ask again. Legacy nulls
        // without `attempted` are inconclusive, just like network/quota errors.
        requested.delete(leg.id);
      }
    };
    const plan = async (attempt: number) => {
      if (controller.signal.aborted) return;
      // A different mounted chain may have filled the shared cache meanwhile.
      for (const signature of requested.keys()) {
        if (plannedGeometries.has(signature)) requested.delete(signature);
      }
      try {
        if (requested.size) {
          await planJourneyDirections([...requested.values()], controller.signal, applyLeg);
        }
      } catch {
        // Keep unanswered legs pending; successful earlier batches are cached.
      }
      if (controller.signal.aborted) return;
      setRevision((value) => value + 1);
      if (requested.size && attempt < retryDelays.length) {
        retryTimer = setTimeout(() => { void plan(attempt + 1); }, retryDelays[attempt]);
      }
    };
    void plan(0);
    return () => {
      controller.abort();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [requestKey]);

  return useMemo(() => {
    const geometryByLeg: Record<string, Coordinate[]> = {};
    legs.forEach((leg) => {
      if (leg.pendingTrack && !leg.trackBridge) return;
      const planned = plannedGeometries.get(legSignature(leg));
      const coordinates = leg.recordedGeometry ?? (planned ? composeJourneyLegGeometry(leg, planned) : undefined);
      if (coordinates && coordinates.length >= 2) geometryByLeg[leg.id] = coordinates;
    });
    return geometryByLeg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, ready, revision]);
}
