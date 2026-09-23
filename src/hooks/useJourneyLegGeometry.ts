import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { planJourneyDirections, type PlannedLeg } from '../lib/amapGeocoding';
import type { JourneyLeg } from '../lib/journeyStops';
import type { Coordinate } from '../lib/routeSegments';

// Keyed by the coordinate pair rather than the row ids: reordering or editing a
// journey keeps the same pairs, and the server caches on the same identity.
const plannedGeometries = new Map<string, Coordinate[]>();
const failedLegs = new Set<string>();

function legSignature(leg: JourneyLeg) {
  const point = ([lng, lat]: Coordinate) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
  return `${leg.mode}:${point(leg.from)}:${point(leg.to)}`;
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
  const requestKey = useMemo(() => {
    // Asking before the stored plans are read back would re-buy what the device
    // already paid for.
    if (!enabled || !ready) return '';
    return legs
      .filter((leg) => !leg.recordedGeometry && !plannedGeometries.has(legSignature(leg)) && !failedLegs.has(legSignature(leg)))
      .map(legSignature)
      .join('|');
  }, [enabled, legs, ready, revision]);

  useEffect(() => {
    if (!requestKey) return;
    const signatures = requestKey.split('|');
    const requested = legs.filter((leg) => signatures.includes(legSignature(leg)));
    if (!requested.length) return;
    const controller = new AbortController();
    let changed = false;
    // Each batch lands here as it arrives rather than being collected and
    // returned at the end: a journey whose second batch is aborted (the user
    // paged away, a row was edited) used to throw away the first batch it had
    // already paid AMap for, and re-buy it on the next open.
    const applyLeg = (leg: PlannedLeg) => {
      if (leg.coordinates?.length) {
        remember(leg.id, leg.coordinates);
        changed = true;
      } else if (leg.attempted !== false && !failedLegs.has(leg.id)) {
        // Only a verdict that no road exists between these two places is worth
        // remembering. A leg the function ran out of budget on, or one whose
        // AMap call errored, has to stay askable: it is the tail of the chain
        // that gets cut, which is exactly the last day group rendering as a
        // straight line until the journey is rebuilt.
        failedLegs.add(leg.id);
        changed = true;
      }
    };
    void planJourneyDirections(requested.map((leg) => ({
      id: legSignature(leg),
      mode: leg.mode,
      from: leg.from,
      to: leg.to,
    })), controller.signal, applyLeg)
      .catch(() => {
        // A journey that cannot be planned still shows its numbered stops.
      })
      .finally(() => {
        if (changed) setRevision((value) => value + 1);
      });
    return () => controller.abort();
  }, [requestKey]);

  return useMemo(() => {
    const geometryByLeg: Record<string, Coordinate[]> = {};
    legs.forEach((leg) => {
      const coordinates = leg.recordedGeometry ?? plannedGeometries.get(legSignature(leg));
      if (coordinates && coordinates.length >= 2) geometryByLeg[leg.id] = coordinates;
    });
    return geometryByLeg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, ready, revision]);
}
