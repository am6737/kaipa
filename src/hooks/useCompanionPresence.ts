// Live companion presence over Supabase realtime channels. See
// src/lib/companionPresence.ts for why presence (not a table) carries this and
// what the deliberate v1 limits are.
//
// Two halves, sharing one socket channel per journey:
// - usePresencePublisher mounts app-wide (DataContext) and owns the "am I
//   sharing" side: one location watch while the toggle is on, no matter which
//   screen the user is reading.
// - useCompanionLocations mounts with the journey detail map and owns the
//   "where is everyone else" side.
// Both go through a refcounted bus keyed by the journey id, which lives in
// src/lib/companionPresenceBus.ts: supabase-js hands the *same* channel object
// to two callers of channel(name), so two independent hooks on one device would
// fight over it. The bus owns the single subscription and tells its users when
// it is ready (including after a socket reconnect, which is when a tracker must
// replay its presence). Dropping to zero refs does *not* unsubscribe — see
// releaseBus there, which explains why releasing a channel and re-acquiring it
// inside one round trip produced a share that never started.
//
// Security note: the channel topic carries the journey's uuid and anyone with
// the anon key + that uuid could join the presence set. v1 accepts that
// (uuid-not-enumerable + the payload is only a coarse live position that
// requires an *open* toggle to exist at all); binding the channel to journey
// membership is the known next step, not an oversight. Binding it matters for
// more than eavesdropping: the track payload is unverified in both directions,
// so a joiner can also *write* one — and the viewer resolves a companion's
// avatar from `userId` in that payload, which is enough to draw a known
// companion at a place they have never stood.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import {
  setLastSelfPresence,
  setSharingJourneyId,
  useLastSelfPresence,
  useSharingJourneyId,
  type CompanionPresence,
} from '../lib/companionPresence';
import { acquireBus, onBusReady, releaseBus } from '../lib/companionPresenceBus';

// Position deltas below this do not deserve a broadcast; the keep-alive at
// PRESENCE_REBROADCAST_MS still refreshes fixedAt so the ring stays honest
// while the app is genuinely foregrounded and moving slowly.
const MOVE_MIN_METERS = 15;
// Re-send the current fix at least this often so "fresh" means "the app is
// alive", not "the device happened to move".
const PRESENCE_REBROADCAST_MS = 30_000;
// Self-hosted Realtime allows 5 presence calls per connection per 30 seconds by
// default (CLIENT_PRESENCE_MAX_CALLS / CLIENT_PRESENCE_WINDOW_MS, see
// infra/supabase/docker/CONFIG.md:859), and a move-triggered broadcast used to be
// bounded only by how fast the device produced fixes — which is to say not at all
// in a car or a cable car to the trailhead. Eight seconds keeps the worst case at
// four tracks a window, keep-alive included, under that ceiling.
const MIN_TRACK_GAP_MS = 8_000;

function metersBetween(a: CompanionPresence, bLng: number, bLat: number) {
  // Flat-earth at journey scales; a city-block error is not worth a haversine.
  const x = (bLng - a.longitude) * Math.cos((a.latitude * Math.PI) / 180) * 111_320;
  const y = (bLat - a.latitude) * 110_540;
  return Math.sqrt(x * x + y * y);
}

function toPresence(position: Location.LocationObject, userId: string): CompanionPresence {
  const now = Date.now();
  return {
    userId,
    longitude: position.coords.longitude,
    latitude: position.coords.latitude,
    fixedAt: typeof position.timestamp === 'number' && Number.isFinite(position.timestamp)
      ? position.timestamp
      : now,
    // The pin this user sees of themselves ages on the same arrival clock as
    // everybody else's, so a publisher that stops getting through goes grey on
    // its own screen too — the one honest signal this feature is allowed to
    // give without a toast.
    seenAt: now,
  };
}

// ---- publisher ----

export function usePresencePublisher(userId: string | null) {
  const sharingJourneyId = useSharingJourneyId();
  useEffect(() => {
    if (!userId) {
      // Signing out does not reload the bundle, so the module-level toggle would
      // otherwise survive it — and the next account to log in on this phone
      // would hand its position to a journey it is not part of, while the switch
      // on that journey's card shows off.
      setSharingJourneyId(null);
      return;
    }
    if (!sharingJourneyId) return;
    const publisherId = userId;
    const bus = acquireBus(sharingJourneyId);
    let disposed = false;
    let positionSub: Location.LocationSubscription | null = null;
    let latest: CompanionPresence | null = null;
    let lastBroadcastAt = 0;

    const broadcast = (force = false) => {
      // subscribed is only ever set by the join callback of a real channel, so
      // the null test is for the type, not for a race.
      const channel = bus.channel;
      if (!channel || !bus.subscribed || !latest) return;
      const now = Date.now();
      if (now - lastBroadcastAt < (force ? MIN_TRACK_GAP_MS : PRESENCE_REBROADCAST_MS)) return;
      lastBroadcastAt = now;
      if (!force) {
        // Presence tells peers about a *diff*, so the keep-alive has to change
        // the payload to mean anything: re-sending the identical fix refreshed
        // nothing on their map, and a companion standing still went grey at 2
        // minutes and off the map at 30 with their app open and sharing. A
        // stationary phone reporting the same place *is* a new report, so the
        // stamp moves with it. (Movement publishes arrive already re-stamped by
        // toPresence, and a replay of an old fix deliberately keeps its age.)
        latest = { ...latest, fixedAt: now, seenAt: now };
      }
      void channel.track(latest).catch(() => {});
      setLastSelfPresence(latest);
    };

    let watchStarting = false;
    const startWatch = async () => {
      if (disposed || positionSub || watchStarting) return;
      watchStarting = true;
      // A cached fix only shortcuts the first avatar. It must never decide
      // whether the watch runs: getLastKnownPositionAsync returns null on a
      // clean session (nothing located yet) or when the last fix is older than
      // maxAge — which is exactly the user who has been reading the map
      // stationary for five minutes before tapping share. Returning there left
      // the toggle on with no watch and nothing published, forever.
      try {
        if (!latest) {
          const cached = await Location.getLastKnownPositionAsync({ maxAge: 120_000 })
            .catch(() => null);
          if (disposed) return;
          if (cached && !latest) {
            latest = toPresence(cached, publisherId);
            broadcast(true);
          }
        }
      } finally {
        watchStarting = false;
      }
      if (disposed || positionSub) return;
      void Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5_000,
          distanceInterval: 10,
        },
        (position) => {
          if (disposed) return;
          const next = toPresence(position, publisherId);
          const moved = !latest || metersBetween(latest, next.longitude, next.latitude) >= MOVE_MIN_METERS;
          latest = next;
          if (moved) broadcast(true);
          else broadcast();
        },
      ).then((sub) => {
        if (disposed) sub.remove();
        else positionSub = sub;
      }).catch((error) => {
        // All the user sees of this is the switch staying on with no avatar
        // appearing, so keep the reason for whoever chases the report: revoked
        // permission mid-session, or location services off on the device.
        console.warn(
          'companion presence: location watch failed',
          error instanceof Error ? error.message : error,
        );
      });
    };

    const cancelReady = onBusReady(bus, () => {
      // On a (re)join: replay the presence the server dropped, then make sure
      // the location watch is running (it lapses while the app is suspended).
      if (latest) broadcast(true);
      void startWatch();
    });

    // Coming back to the foreground after a suspend the socket may still be up
    // but our last fix is now stale; republish the freshest one immediately.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') broadcast(true);
    });

    return () => {
      disposed = true;
      positionSub?.remove();
      appStateSub.remove();
      cancelReady();
      setLastSelfPresence(null);
      if (bus.channel && bus.subscribed) {
        // Stop publishing here, not by leaving the channel. The map usually
        // still holds a ref to this bus, so the channel outlives the toggle and
        // an un-untracked presence keeps showing this position to everyone in
        // the journey until a viewer's 30 minute drop; the local avatar vanishes
        // immediately either way, so nothing on this screen says it is lying.
        void bus.channel.untrack().catch(() => {});
      }
      releaseBus(sharingJourneyId, bus);
    };
  }, [userId, sharingJourneyId]);
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
  // The publisher's own pin has to age on this clock too, and it is the case
  // where a clock matters most: if publishing stalls, no new self presence
  // arrives, so nothing else would ever make the ring go grey.
  const drawn = hasPeers || !!useLastSelfPresence();
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
