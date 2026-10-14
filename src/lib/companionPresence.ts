// Foreground companion locations. Identity, timestamps and leases come from the
// authenticated server protocol; this module only folds trusted snapshots and
// shares local UI state. WGS-84 coordinates are projected by NativeMap.
// No toggle persists across a cold start or sign-out.

import { useSyncExternalStore } from 'react';

export interface CompanionPresence {
  /** auth user id of the sharing companion */
  userId: string;
  /** WGS-84 degrees */
  longitude: number;
  /** WGS-84 degrees */
  latitude: number;
  /** epoch ms of the server-accepted publication */
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

/**
 * Fold trusted HTTP snapshot readings into one marker per real user.
 * The database chooses the newest device publication; this also tolerates
 * duplicate readings without duplicate marker IDs. Unchanged readings retain
 * their local arrival time, so unrelated polling cannot refresh a quiet peer.
 * Structural/coordinate checks are defensive parsing, not authentication.
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
      // A delayed snapshot must not draw an ancient publication. Server and
      // device clocks may differ; a stamp ahead of ours is still drawable.
      if (presence.fixedAt <= now && now - presence.fixedAt > PRESENCE_DROP_MS)
        return;
      const current = bestByUser.get(presence.userId);
      if (!current || presence.fixedAt > current.fixedAt) {
        bestByUser.set(presence.userId, presence);
      }
    });
  });
  const roster: CompanionPresence[] = [];
  bestByUser.forEach((presence, userId) => {
    const last = previous.find((peer) => peer.userId === userId);
    const unchanged =
      !!last &&
      last.fixedAt === presence.fixedAt &&
      last.longitude === presence.longitude &&
      last.latitude === presence.latitude;
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
  const { userId, longitude, latitude, fixedAt } = raw as Record<
    string,
    unknown
  >;
  if (typeof userId !== 'string' || !userId) return null;
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    return null;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  )
    return null;
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
// Peers see server snapshots. The self pin appears only after a successful
// publish acknowledgement; pausing/closing clears it immediately.
let lastSelfPresence: CompanionPresence | null = null;
let lastKnownSelfPresence: CompanionPresence | null = null;
const selfPresenceListeners = new Set<() => void>();

export function setLastSelfPresence(presence: CompanionPresence | null) {
  lastSelfPresence = presence;
  if (presence) lastKnownSelfPresence = presence;
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

/** Last local fix, retained across a quick share toggle so the pin can be
 * drawn immediately while the next GPS callback is warming up. */
export function getLastSelfPresence(): CompanionPresence | null {
  return lastKnownSelfPresence;
}

export function clearLastSelfPresenceHistory() {
  lastKnownSelfPresence = null;
}
