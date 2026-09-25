// The connection pool behind live companion presence: one realtime channel per
// journey, shared by whoever asks for it. This lives apart from the hooks that
// use it (src/hooks/useCompanionPresence.ts) because its rules are about
// supabase-js's channel lifecycle, not React's, and they are the part of this
// feature that is easy to get silently wrong (see busyTopic).

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  foldPresenceRoster,
  presenceChannelName,
  type CompanionPresence,
} from './companionPresence';

export interface PresenceBus {
  /** Null while the topic is still owned by a channel that is leaving. */
  channel: RealtimeChannel | null;
  refs: number;
  /** 0 while someone is using it; the clock time the last user let go. */
  idleSince: number;
  subscribed: boolean;
  peers: CompanionPresence[];
  listeners: Set<(peers: CompanionPresence[]) => void>;
  readyListeners: Set<() => void>;
  /** Polls for the departing channel to let go of the topic. */
  joinTimer: ReturnType<typeof setInterval> | null;
}

const buses = new Map<string, PresenceBus>();

// How many viewed journeys keep a joined channel for the rest of the session.
// A bus is never torn down when its refs drop to zero (see releaseBus), so this
// is the only bound on them; when the cap is reached the longest-idle one goes,
// and if every bus is in use the cap is exceeded rather than a live share cut.
export const MAX_LIVE_BUSES = 8;
const TOPIC_FREE_POLL_MS = 250;
// How long to wait for a departing channel to release the topic before giving up
// on joining. A bus that never gets a channel stays subscribed=false, which every
// consumer already treats as "not sharing yet".
const TOPIC_FREE_MAX_WAIT_MS = 10_000;

function newBus(): PresenceBus {
  return {
    channel: null,
    refs: 1,
    idleSince: 0,
    subscribed: false,
    peers: [],
    listeners: new Set(),
    readyListeners: new Set(),
    joinTimer: null,
  };
}

/** Retire the idlest bus so the map stays bounded. */
function evictIdleBus() {
  const idle = [...buses.entries()].filter(([, bus]) => bus.refs <= 0 && bus.idleSince > 0);
  if (!idle.length) return;
  const [journeyId, bus] = idle.reduce((a, b) => (b[1].idleSince < a[1].idleSince ? b : a));
  stopBus(journeyId, bus);
  if (bus.channel) void supabase.removeChannel(bus.channel);
}

function stopBus(journeyId: string, bus: PresenceBus) {
  buses.delete(journeyId);
  if (bus.joinTimer) clearInterval(bus.joinTimer);
  bus.joinTimer = null;
}

/**
 * Is some channel still holding this topic?
 *
 * `RealtimeClient.channel()` reuses any existing channel with the same topic
 * instead of building a fresh one, and `RealtimeChannel.subscribe()` does
 * nothing at all unless that channel's state is exactly 'closed'. So acquiring
 * while a leave is in flight silently produces a bus that never reports
 * SUBSCRIBED — the publisher's broadcast() short-circuits on it forever and the
 * switch reads "sharing" with nobody able to see the position. It stays hidden
 * because the only way in is releasing and re-acquiring inside one round trip:
 * toggling share off and on quickly, or the search overlay covering and
 * uncovering the map. Hence releaseBus not unsubscribing at all.
 */
function busyTopic(journeyId: string) {
  const topic = `realtime:${presenceChannelName(journeyId)}`;
  return supabase.realtime.getChannels().some((channel) => channel.topic === topic);
}

export function acquireBus(journeyId: string): PresenceBus {
  const existing = buses.get(journeyId);
  if (existing) {
    existing.refs += 1;
    existing.idleSince = 0;
    return existing;
  }
  if (buses.size >= MAX_LIVE_BUSES) evictIdleBus();
  const bus = newBus();
  buses.set(journeyId, bus);
  if (!busyTopic(journeyId)) {
    attachChannel(journeyId, bus);
    return bus;
  }
  // Reusing the departing channel is the dead-bus bug above, so wait for the
  // leave to land and join then. Nothing else has to know: subscribers and the
  // publisher both key off bus.subscribed, which fires from the late join.
  const deadline = Date.now() + TOPIC_FREE_MAX_WAIT_MS;
  bus.joinTimer = setInterval(() => {
    if (bus.channel) return;
    if (!busyTopic(journeyId)) {
      attachChannel(journeyId, bus);
      return;
    }
    if (Date.now() > deadline || bus.refs <= 0) stopBus(journeyId, bus);
  }, TOPIC_FREE_POLL_MS);
  return bus;
}

function attachChannel(journeyId: string, bus: PresenceBus) {
  if (bus.joinTimer) clearInterval(bus.joinTimer);
  bus.joinTimer = null;
  const channel = supabase.channel(presenceChannelName(journeyId));
  bus.channel = channel;
  channel
    .on('presence', { event: 'sync' }, () => {
      const next = foldPresenceRoster(Object.values(channel.presenceState()), Date.now(), bus.peers);
      // Presence syncs fire on any roster churn; only wake listeners when a
      // drawn value actually changed, or a steady group would re-snapshot
      // every avatar marker on the map.
      const changed = next.length !== bus.peers.length
        || next.some((peer, index) => {
          const current = bus.peers[index];
          return !current
            || current.userId !== peer.userId
            || current.fixedAt !== peer.fixedAt
            || current.longitude !== peer.longitude
            || current.latitude !== peer.latitude;
        });
      if (!changed) return;
      bus.peers = next;
      bus.listeners.forEach((listener) => listener(next));
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        bus.subscribed = false;
        return;
      }
      // Fires on the first join *and* every reconnect; the publisher replays
      // its track off these ready callbacks (supabase-js does not re-track for
      // us) and the viewer pulls the roster that rejoined with.
      bus.subscribed = true;
      bus.readyListeners.forEach((listener) => listener());
    });
}

export function releaseBus(journeyId: string, bus: PresenceBus) {
  bus.refs = Math.max(0, bus.refs - 1);
  // The channel stays joined and the bus stays in the map. Unsubscribing here
  // is what made a release race the next acquire (see busyTopic); the roster is
  // kept honest instead by the publisher's explicit untrack(), so stopping a
  // share no longer depends on anyone leaving a channel.
  if (bus.refs === 0) bus.idleSince = Date.now();
}

/**
 * Run `onReady` now if the channel is joined, and again on every later
 * (re)join, until the returned cancel runs.
 */
export function onBusReady(bus: PresenceBus, onReady: () => void): () => void {
  if (bus.subscribed) onReady();
  bus.readyListeners.add(onReady);
  return () => bus.readyListeners.delete(onReady);
}
