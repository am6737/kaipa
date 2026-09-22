import { useEffect, useMemo, useState } from 'react';
import { planJourneyDirections } from '../lib/amapGeocoding';
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

/**
 * Road geometry for the legs between itinerary stops. Legs whose plan has not
 * arrived (or failed) are simply absent from the result, which is what lets the
 * map draw them as a plain dashed link instead of a road.
 */
export function useJourneyLegGeometry(legs: JourneyLeg[], enabled: boolean): Record<string, Coordinate[]> {
  const [revision, setRevision] = useState(0);
  const requestKey = useMemo(() => {
    if (!enabled) return '';
    return legs
      .filter((leg) => !leg.recordedGeometry && !plannedGeometries.has(legSignature(leg)) && !failedLegs.has(legSignature(leg)))
      .map(legSignature)
      .join('|');
  }, [enabled, legs, revision]);

  useEffect(() => {
    if (!requestKey) return;
    const signatures = requestKey.split('|');
    const requested = legs.filter((leg) => signatures.includes(legSignature(leg)));
    if (!requested.length) return;
    const controller = new AbortController();
    void planJourneyDirections(requested.map((leg) => ({
      id: legSignature(leg),
      mode: leg.mode,
      from: leg.from,
      to: leg.to,
    })), controller.signal)
      .then((planned) => {
        if (controller.signal.aborted) return;
        let changed = false;
        planned.forEach((leg) => {
          if (leg.coordinates?.length) {
            plannedGeometries.set(leg.id, leg.coordinates);
            changed = true;
          } else if (!failedLegs.has(leg.id)) {
            failedLegs.add(leg.id);
            changed = true;
          }
        });
        if (changed) setRevision((value) => value + 1);
      })
      .catch(() => {
        // A journey that cannot be planned still shows its numbered stops.
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
  }, [legs, revision]);
}
