// compassHeading.ts — the phone's compass heading for a "you are here" cone.
//
// The sensor reports many times a second and jitters by a few degrees even in
// a still hand; every change rebuilds the map's marker array. So the heading
// comes out in fixed steps, and it only moves to a new step once the reading is
// clearly past the boundary, not while it hovers on it.
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

const STEP_DEGREES = 15;
// How far past the half-step a reading must go before the cone turns.
const HYSTERESIS_DEGREES = 4;

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Degrees clockwise from north in STEP_DEGREES steps, or null with no compass. */
export function useCompassHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      return;
    }
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((value) => {
      // trueHeading needs a location fix and is -1 until it has one.
      const raw = value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
      if (!Number.isFinite(raw) || raw < 0) return;
      setHeading((current) => {
        if (current != null && angularDistance(current, raw) < STEP_DEGREES / 2 + HYSTERESIS_DEGREES) return current;
        return (Math.round(raw / STEP_DEGREES) * STEP_DEGREES) % 360;
      });
    })
      .then((next) => {
        if (cancelled) next.remove();
        else subscription = next;
      })
      // No compass, or no location permission: the marker stays a plain dot.
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return heading;
}
