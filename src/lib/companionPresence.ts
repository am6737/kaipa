// Companion live-location sharing (旅程伙伴位置).
//
// The whole feature is one toggle: while it is on and the app is foregrounded,
// the user's position rides a Supabase realtime *presence* channel keyed by the
// journey id. Presence was chosen over a table on purpose:
//
// - "on = share, off = gone" is exactly presence's join/leave semantics, so
//   nobody has to write a TTL, a sweeper, or an "offline" flag — a killed app
//   drops the socket and the avatar disappears by itself. Turning the toggle off
//   is not a socket drop, though: the publisher has to untrack explicitly,
//   because the map's half of the channel outlives the switch (see
//   useCompanionPresence's releaseBus).
// - No row writes per second; the self-hosted database sees zero traffic from
//   this feature.
//
// Deliberate v1 limits (they are the cheap half of the WeChat behaviour):
// - Foreground only. There is no background location permission, so when the
//   app suspends the position freezes and then lapses with the socket.
// - Freshness is decided by arrival on the *viewer's* device (`seenAt`), never
//   by the sender's stamp: two phones do not agree on the time of day, and a
//   peer's clock being fast used to make that peer invisible.
// - The toggle never persists across cold starts: sharing always begins off.
//   Signing out clears it too (see usePresencePublisher), because no reload
//   happens there either.
// - Coordinates are WGS-84 end to end; `NativeMap` projects per platform, so
//   nothing here may pre-shift them (see src/lib/coordinates usage in
//   NativeMap.ios/android).

import { useSyncExternalStore } from 'react';

export interface CompanionPresence {
  /** auth user id of the sharing companion */
  userId: string;
  /** WGS-84 degrees */
  longitude: number;
  /** WGS-84 degrees */
  latitude: number;
  /** epoch ms of the device fix this position came from — the *sender's* clock */
  fixedAt: number;
  /**
   * epoch ms on *this* device when we last saw this entry change. Every
   * freshness decision uses this, never `fixedAt`: two phones do not agree on
   * the time of day (a companion whose clock runs two minutes ahead was
   * invisible to everyone, forever, and silently), while "did this peer's
   * payload change recently" is a question one clock can answer.
   */
  seenAt: number;
}

/** A fix older than this reads as stale (grey ring + "x分钟前"). */
export const PRESENCE_STALE_MS = 2 * 60_000;
/** A fix older than this is not worth drawing at all. */
export const PRESENCE_DROP_MS = 30 * 60_000;

export function presenceChannelName(journeyId: string) {
  return `journey-presence:${journeyId}`;
}

/**
 * Fold a presence roster into one entry per user.
 *
 * The argument is `Object.values(channel.presenceState())`: one group per
 * *connection*, each holding everything that connection tracked. Grouping by
 * the presence key is what used to collapse one user's several connections
 * into one avatar, but realtime-js 2.108 stopped sending the key `track()` is
 * given (its `track(payload, opts)` forwards only `opts.timeout`), so the
 * grouping is per socket and has to happen here instead: newest fix per
 * `userId`, or a companion on a phone and a tablet draws two avatars — and two
 * markers with the same clipId.
 *
 * `previous` is what we published to the UI last time. An entry whose stamp and
 * coordinates are unchanged keeps its old `seenAt`, so "how long since this peer
 * said anything" survives every unrelated roster churn; anything new or changed
 * is stamped with `now`, the arrival time on this device.
 *
 * Anything that is not a complete, finite reading is dropped rather than
 * trusted. A missing `fixedAt` used to survive (the payload was cast, not
 * checked) and then compared as NaN: `age > PRESENCE_DROP_MS` is false for NaN,
 * so that entry rendered forever as a fresh, never-staling avatar.
 */
export function foldPresenceRoster(
  groups: unknown[][],
  now: number,
  previous: readonly CompanionPresence[] = [],
): CompanionPresence[] {
  const bestByUser = new Map<string, RawReading>();
  groups.forEach((entries) => {
    entries.forEach((raw) => {
      const presence = readPresence(raw);
      if (!presence) return;
      // The sender's clock only gets a one-sided vote here: an entry nobody has
      // refreshed in half an hour is not worth drawing even on the strength of
      // its arrival, because a rejoin hands us the whole roster at once. A head
      // start on the clock must not drop anyone, so `<= now` gates it.
      if (presence.fixedAt <= now && now - presence.fixedAt > PRESENCE_DROP_MS) return;
      const current = bestByUser.get(presence.userId);
      if (!current || presence.fixedAt > current.fixedAt) {
        bestByUser.set(presence.userId, presence);
      }
    });
  });
  const roster: CompanionPresence[] = [];
  bestByUser.forEach((presence, userId) => {
    const last = previous.find((peer) => peer.userId === userId);
    const unchanged = !!last
      && last.fixedAt === presence.fixedAt
      && last.longitude === presence.longitude
      && last.latitude === presence.latitude;
    const entry: CompanionPresence = {
      ...presence,
      seenAt: unchanged && last ? last.seenAt : now,
    };
    if (now - entry.seenAt > PRESENCE_DROP_MS) return;
    roster.push(entry);
  });
  return roster.sort((a, b) => a.userId.localeCompare(b.userId));
}

type RawReading = Omit<CompanionPresence, 'seenAt'>;

function readPresence(raw: unknown): RawReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const { userId, longitude, latitude, fixedAt } = raw as Record<string, unknown>;
  if (typeof userId !== 'string' || !userId) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null;
  if (typeof fixedAt !== 'number' || !Number.isFinite(fixedAt)) return null;
  return { userId, longitude, latitude, fixedAt };
}

// ---- the one bit of shared state: which journey (if any) we publish to ----
// Module level so the toggle in the journey detail and the publisher mounted
// app-wide see the same answer without threading it through contexts. In-memory
// only — see "never persists across cold starts" above.
let sharingJourneyId: string | null = null;
const sharingListeners = new Set<() => void>();

export function setSharingJourneyId(journeyId: string | null) {
  if (sharingJourneyId === journeyId) return;
  sharingJourneyId = journeyId;
  sharingListeners.forEach((listener) => listener());
}

export function getSharingJourneyId() {
  return sharingJourneyId;
}

export function useSharingJourneyId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      sharingListeners.add(listener);
      return () => sharingListeners.delete(listener);
    },
    () => sharingJourneyId,
    () => sharingJourneyId,
  );
}

// ---- the publisher's latest self fix ----
// Peers see us through presence; our own map wants the same avatar without
// waiting for its own presence round-trip. The publisher writes here whenever
// it has a fresh fix while sharing; the journey map draws it as a self pin.
let lastSelfPresence: CompanionPresence | null = null;
const selfPresenceListeners = new Set<() => void>();

export function setLastSelfPresence(presence: CompanionPresence | null) {
  lastSelfPresence = presence;
  selfPresenceListeners.forEach((listener) => listener());
}

export function useLastSelfPresence(): CompanionPresence | null {
  return useSyncExternalStore(
    (listener) => {
      selfPresenceListeners.add(listener);
      return () => selfPresenceListeners.delete(listener);
    },
    () => lastSelfPresence,
    () => lastSelfPresence,
  );
}
