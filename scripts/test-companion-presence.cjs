// Companion live-location presence: the roster fold and the channel bus.
//
// What this covers is the part that cannot be settled by reading the hook: the
// fold that keeps one avatar per user, and the bus lifecycle behind "I turned
// sharing off" / "I reopened the same journey a moment later". The bus rules
// exist because of how supabase-js 2.108.1 actually behaves, so FakeSocket
// mirrors that behaviour exactly: channel() hands back the topic's existing
// channel (RealtimeClient.js:343), subscribe() does nothing at all unless the
// channel state is 'closed' (RealtimeChannel.js:137), and leave() parks the
// channel in 'leaving' for a round trip before the socket drops it. If a future
// upgrade changes those, the assertions here should fail rather than the feature
// quietly stop sharing.
//
// Not covered, because only a phone can: the marker pixels, the permission
// prompt path, and the realtime server's own presence rate limit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// ---- the realtime-js stand-in ----

class FakeChannel {
  constructor(topic, socket) {
    this.topic = topic;
    this.socket = socket;
    this.state = 'closed';
    this.sync = null;
    this.statusCallback = null;
    this.tracked = [];
    this.untracked = 0;
    this.roster = {};
  }
  on(_kind, _opts, callback) { this.sync = callback; return this; }
  presenceState() { return this.roster; }
  subscribe(callback) {
    this.statusCallback = callback;
    if (this.state !== 'closed') return this;
    this.state = 'joining';
    this.socket.joins += 1;
    return this;
  }
  /** The test's "the join ack came back". */
  settleJoin() {
    if (this.state !== 'joining') return;
    this.state = 'joined';
    this.statusCallback?.('SUBSCRIBED');
  }
  track(payload) {
    if (this.state !== 'joined') return Promise.reject(new Error('not joined'));
    this.tracked.push(payload);
    return Promise.resolve('ok');
  }
  untrack() {
    if (this.state !== 'joined') return Promise.reject(new Error('not joined'));
    this.untracked += 1;
    return Promise.resolve('ok');
  }
  /** Phoenix leave(): 'leaving' until the ack (or its timeout) lands. */
  leave() {
    if (this.state === 'closed') return Promise.resolve('ok');
    this.state = 'leaving';
    return new Promise((resolve) => {
      this.settleLeave = () => {
        this.state = 'closed';
        this.socket.channels = this.socket.channels.filter((channel) => channel !== this);
        resolve('ok');
      };
    });
  }
  /** A roster diff arrived from the server. */
  emitRoster(roster) { this.roster = roster; this.sync?.(); }
}

class FakeSocket {
  constructor() { this.channels = []; this.joins = 0; this.removes = 0; }
  channel(topic) {
    const existing = this.channels.find((channel) => channel.topic === `realtime:${topic}`);
    if (existing) return existing;
    const created = new FakeChannel(`realtime:${topic}`, this);
    this.channels.push(created);
    return created;
  }
  getChannels() { return this.channels; }
  removeChannel(channel) { this.removes += 1; return channel.leave(); }
}

const USER = 'user-1';

function makeWorld(start = 1_800_000_000_000) {
  // A clock the test drives by hand: every freshness rule in this feature is a
  // comparison against now, and "now" must be movable for them to be assertable.
  const clock = { value: start };
  class FakeDate extends Date { static now() { return clock.value; } }
  const socket = new FakeSocket();
  const supabase = {
    realtime: socket,
    channel: (topic) => socket.channel(topic),
    removeChannel: (channel) => socket.removeChannel(channel),
  };
  let effectIndex = 0;
  const effects = [];
  const watch = { callback: null, removed: 0 };
  // What the device hands back for the two questions the publisher asks: is
  // there a recent cached fix, and does that lookup even succeed.
  const location = { cached: null, cacheRejects: false };
  const react = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    // Effects run inline at the hook call, cleanup-then-setup when the deps
    // change — the order React uses, which is what the publisher's teardown
    // (untrack before release) depends on.
    useEffect: (fn, deps) => {
      const index = effectIndex++;
      const previous = effects[index];
      const changed = !previous || !previous.deps || !deps
        || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      effects[index] = { deps };
      if (changed) {
        previous?.cleanup?.();
        effects[index].cleanup = fn() || null;
      }
    },
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  react.default = react;
  const mocks = {
    react,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-location': {
      Accuracy: { Balanced: 1 },
      getLastKnownPositionAsync: async () => {
        if (location.cacheRejects) throw new Error('permissions changed since we asked');
        return location.cached;
      },
      watchPositionAsync: async (_options, callback) => {
        watch.callback = callback;
        return { remove() { watch.removed += 1; } };
      },
    },
    './supabase': { supabase },
    '../lib/supabase': { supabase },
  };
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(file);
    if (cache.has(resolved)) return cache.get(resolved);
    const js = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context = {
      exports: {},
      setInterval, clearInterval, setTimeout, clearTimeout,
      Date: FakeDate,
      require: (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(resolved), name);
        for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
          if (fs.existsSync(candidate)) return load(candidate);
        }
      }
      throw new Error(`Unexpected dependency: ${name} (from ${file})`);
    } };
    vm.runInNewContext(js, context);
    cache.set(resolved, context.exports);
    return context.exports;
  }
  const lib = () => load('src/lib/companionPresence.ts');
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const world = {
    socket,
    load,
    settled,
    wait,
    watch,
    location,
    now: () => clock.value,
    advance: (ms) => { clock.value += ms; },
    fix: (lat = 30) => ({ coords: { longitude: 100, latitude: lat }, timestamp: clock.value }),
    /** The same call the switch makes. */
    share(journeyId) { lib().setSharingJourneyId(journeyId); },
    /** One render of the publisher hook. */
    render(userId = USER) {
      effectIndex = 0;
      world.publisher(userId);
    },
    /** Start sharing and render, the way tapping the pill does. */
    async startSharing(journeyId) {
      world.share(journeyId);
      world.render();
      await settled();
    },
    async stopSharing() {
      world.share(null);
      world.render();
      await settled();
    },
    async feed(lng = 100, lat = 30) {
      watch.callback?.({ coords: { longitude: lng, latitude: lat }, timestamp: clock.value });
      await settled();
    },
    channel(journeyId) {
      return socket.channels.find((channel) => channel.topic === `realtime:journey-presence:${journeyId}`);
    },
  };
  Object.defineProperty(world, 'publisher', {
    get() { return load('src/hooks/useCompanionPresence.ts').usePresencePublisher; },
  });
  return world;
}

// ---- the roster fold ----

const NOW = 1_800_000_000_000;

test('one companion is one entry, however many connections tracked', () => {
  const { foldPresenceRoster } = makeWorld().load('src/lib/companionPresence.ts');
  const phone = { userId: 'u1', longitude: 100, latitude: 30, fixedAt: NOW - 60_000 };
  const tablet = { userId: 'u1', longitude: 100, latitude: 31, fixedAt: NOW - 300_000 };
  const roster = foldPresenceRoster([[tablet], [phone]], NOW);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].latitude, 30, 'the fresher of the two fixes wins');
});

test('a roster is sorted by user so the marker memo sees a stable list', () => {
  const { foldPresenceRoster } = makeWorld().load('src/lib/companionPresence.ts');
  const at = (id, minutes) => ({ userId: id, longitude: 100, latitude: 30, fixedAt: NOW - minutes * 60_000 });
  const roster = foldPresenceRoster([[at('zoe', 1)], [at('amy', 1)]], NOW);
  // join() rather than deepEqual: the module runs in its own realm, so its
  // arrays are not host Arrays and a strict deep-equal would be about realms.
  assert.equal(roster.map((peer) => peer.userId).join(','), 'amy,zoe');
});

test('incomplete or unreadable presence entries are dropped, not drawn', () => {
  const { foldPresenceRoster } = makeWorld().load('src/lib/companionPresence.ts');
  const good = { userId: 'u1', longitude: 100, latitude: 30, fixedAt: NOW };
  const cases = [
    ['no fix time', { userId: 'u2', longitude: 100, latitude: 30 }],
    ['fix time as a string', { userId: 'u3', longitude: 100, latitude: 30, fixedAt: `${NOW}` }],
    ['fix time NaN', { userId: 'u4', longitude: 100, latitude: 30, fixedAt: NaN }],
    ['no user id', { longitude: 100, latitude: 30, fixedAt: NOW }],
    ['empty user id', { userId: '', longitude: 100, latitude: 30, fixedAt: NOW }],
    ['coordinate as a string', { userId: 'u5', longitude: '100', latitude: 30, fixedAt: NOW }],
    ['coordinate NaN', { userId: 'u6', longitude: 100, latitude: NaN, fixedAt: NOW }],
    ['null entry', null],
    ['entry that is not an object', 7],
  ];
  for (const [label, bad] of cases) {
    assert.equal(foldPresenceRoster([[bad], [good]], NOW).length, 1, label);
  }
});

test('a fix older than the drop window is off the map, the boundary stays on', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS } = makeWorld().load('src/lib/companionPresence.ts');
  const at = (id, agoMs) => ({ userId: id, longitude: 100, latitude: 30, fixedAt: NOW - agoMs });
  const roster = foldPresenceRoster([[
    at('just-inside', PRESENCE_DROP_MS),
    at('one-ms-over', PRESENCE_DROP_MS + 1),
  ]], NOW);
  assert.equal(roster.map((peer) => peer.userId).join(','), 'just-inside');
});

test('the fold returns its own objects, so a caller cannot write through to presence state', () => {
  const { foldPresenceRoster } = makeWorld().load('src/lib/companionPresence.ts');
  const entry = { userId: 'u1', longitude: 100, latitude: 30, fixedAt: NOW };
  const [peer] = foldPresenceRoster([[entry]], NOW);
  peer.latitude = 99;
  assert.equal(entry.latitude, 30);
});

// ---- the bus lifecycle ----

test('one journey has one channel; releasing it does not unsubscribe', () => {
  const world = makeWorld();
  const bus = world.load('src/lib/companionPresenceBus.ts');
  const first = bus.acquireBus('j1');
  const second = bus.acquireBus('j1');
  assert.equal(first, second);
  assert.equal(second.refs, 2);
  assert.equal(world.socket.channels.length, 1);
  const channel = first.channel;
  channel.settleJoin();
  assert.equal(first.subscribed, true);

  bus.releaseBus('j1', first);
  bus.releaseBus('j1', first);
  assert.equal(first.refs, 0);
  assert.equal(world.socket.removes, 0, 'a release must not tear the channel down');
  assert.equal(first.subscribed, true, 'and the bus stays usable');

  const again = bus.acquireBus('j1');
  assert.equal(again, first);
  assert.equal(again.channel, channel);
  assert.equal(again.subscribed, true);
  assert.equal(world.socket.joins, 1, 'the reopen did not rejoin anything');
});

test('reopening a journey whose channel is still leaving joins a fresh channel', async () => {
  const world = makeWorld();
  const bus = world.load('src/lib/companionPresenceBus.ts');
  // Fill the pool, let it all go idle, then open a new journey: that evicts the
  // idlest one. Opening the evicted journey again is the window that used to
  // hand back a channel subscribe() silently refuses.
  const ids = Array.from({ length: bus.MAX_LIVE_BUSES }, (_, index) => `j${index}`);
  const opened = ids.map((id) => {
    const entry = bus.acquireBus(id);
    entry.channel.settleJoin();
    return entry;
  });
  opened.forEach((entry, index) => bus.releaseBus(ids[index], entry));
  bus.acquireBus('j-new');
  const joinsBefore = world.socket.joins;
  const departing = world.channel('j0');
  assert.equal(departing.state, 'leaving', 'the idlest journey was retired to make room');
  assert.equal(world.socket.removes, 1);

  const reopened = bus.acquireBus('j0');
  assert.equal(reopened.channel, null, 'it cannot join while the topic is owned');
  assert.equal(world.socket.joins, joinsBefore, 'and it must not try to');

  let ready = 0;
  bus.onBusReady(reopened, () => { ready += 1; });
  departing.settleLeave();
  await world.wait(400);

  assert.ok(reopened.channel, 'the leave landed, so a new channel was built');
  assert.notEqual(reopened.channel, departing);
  assert.equal(world.socket.joins, joinsBefore + 1);
  reopened.channel.settleJoin();
  assert.equal(reopened.subscribed, true);
  assert.equal(ready, 1, 'a late join still tells the publisher to replay its track');
});

test('a bus in use is never evicted to make room', () => {
  const world = makeWorld();
  const bus = world.load('src/lib/companionPresenceBus.ts');
  const live = bus.acquireBus('shared-journey');
  live.channel.settleJoin();
  for (let index = 0; index < bus.MAX_LIVE_BUSES + 3; index += 1) {
    const id = `other-${index}`;
    bus.releaseBus(id, bus.acquireBus(id));
  }
  assert.equal(bus.acquireBus('shared-journey'), live);
  assert.equal(live.subscribed, true, 'the running share kept its channel');
});

// ---- the publisher: what "off" means ----

test('a session with no cached fix still starts the location watch', async () => {
  // The regression this exists for: getLastKnownPositionAsync answers null on a
  // clean session, and the publisher used to treat that as "stop" instead of
  // "no shortcut avatar" — the switch read on, and nothing was ever published.
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  channel.settleJoin();
  await world.settled();
  assert.ok(world.watch.callback, 'a stale-free cache lookup must not end the share');
  await world.feed();
  assert.equal(channel.tracked.length, 1);
});

test('a rejected cache lookup still starts the location watch', async () => {
  const world = makeWorld();
  world.location.cacheRejects = true;
  await world.startSharing('j1');
  world.channel('j1').settleJoin();
  await world.settled();
  assert.ok(world.watch.callback, 'the same path, one exception wider');
});

test('a cached fix goes out on the join, before the device moves', async () => {
  const world = makeWorld();
  world.location.cached = world.fix(30.002);
  await world.startSharing('j1');
  const channel = world.channel('j1');
  assert.equal(channel.tracked.length, 0, 'nothing is published before the channel joins');
  channel.settleJoin();
  await world.settled();
  assert.equal(channel.tracked.length, 1, 'the cached position is the first avatar');
});

test('turning sharing off untracks, instead of relying on leaving the channel', async () => {
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  assert.equal(channel.state, 'joining', 'the watch has no reason to run yet');
  channel.settleJoin();
  await world.settled();
  await world.feed();
  assert.equal(channel.tracked.length, 1);

  await world.stopSharing();
  assert.equal(channel.untracked, 1, 'peers stop seeing this position immediately');
  assert.equal(channel.state, 'joined', 'the map still holds this channel open');
  assert.equal(world.socket.removes, 0, 'so leaving was never going to stop the share');
  assert.equal(world.watch.removed, 1, 'and the location watch stopped with it');
});

test('sharing again after a stop reuses the bus instead of racing a second join', async () => {
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  channel.settleJoin();
  await world.settled();
  await world.feed();
  await world.stopSharing();

  await world.startSharing('j1');
  assert.equal(world.channel('j1'), channel, 'the same bus is reused');
  assert.equal(world.socket.joins, 1, 'which is the point: there is no leave to collide with');
  await world.feed(100, 30.01);
  assert.equal(channel.tracked.length, 2, 'and the new position goes out');
});

// ---- whose clock decides whether a companion is still there ----

test('freshness is measured on arrival, never on the sender** clock', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS } = makeWorld().load('src/lib/companionPresence.ts');
  // A phone two minutes fast used to produce a negative age in the caller, which
  // dropped it: that companion was invisible to everyone, forever, silently.
  const fast = { userId: 'fast', longitude: 100, latitude: 30, fixedAt: NOW + 5 * 60_000 };
  const roster = foldPresenceRoster([[fast]], NOW);
  assert.equal(roster.length, 1, 'a clock ahead of ours is still a person');
  assert.equal(roster[0].seenAt, NOW, 'and it arrives now, by our clock');
  // A phone behind is only ever a problem when the gap passes the drop window,
  // because that is the one case where the sender** stamp is the only evidence
  // that this roster entry is not a leftover from before we joined.
  const slow = { userId: 'slow', longitude: 100, latitude: 30, fixedAt: NOW - 25 * 60_000 };
  assert.equal(foldPresenceRoster([[slow]], NOW).length, 1, '25 minutes behind is still drawn');
  const ancient = { userId: 'ancient', longitude: 100, latitude: 30, fixedAt: NOW - PRESENCE_DROP_MS - 1 };
  assert.equal(foldPresenceRoster([[ancient]], NOW).length, 0, 'past the window it is not');
});

test('an entry is only refreshed by news about that same user', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS, PRESENCE_STALE_MS } = makeWorld().load('src/lib/companionPresence.ts');
  const quiet = { userId: 'still', longitude: 100, latitude: 30, fixedAt: NOW - 60_000 };
  const first = foldPresenceRoster([[quiet]], NOW);
  assert.equal(first[0].seenAt, NOW);

  const later = NOW + 180_000;
  const noisy = { userId: 'other', longitude: 101, latitude: 31, fixedAt: later };
  const second = foldPresenceRoster([[quiet], [noisy]], later, first);
  assert.equal(second.length, 2);
  assert.equal(second.find((peer) => peer.userId === 'still').seenAt, NOW,
    'someone else moving is not a report from this one');
  assert.ok(later - second.find((peer) => peer.userId === 'still').seenAt > PRESENCE_STALE_MS,
    'so its ring does go grey, which is the point');

  const restamped = { ...quiet, fixedAt: later };
  const third = foldPresenceRoster([[restamped]], later, second);
  assert.equal(third.find((peer) => peer.userId === 'still').seenAt, later,
    'a new stamp from the same user is a report');
  assert.equal(foldPresenceRoster([[quiet]], NOW + PRESENCE_DROP_MS + 1, first).length, 0,
    'and half an hour without one takes it off the map');
});

// ---- what the publisher sends, and how often ----

test('the keep-alive re-stamps, because an identical payload is not a diff', async () => {
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  channel.settleJoin();
  await world.settled();
  await world.feed();
  const first = channel.tracked[channel.tracked.length - 1];

  // Standing still in one place while sharing: the watch keeps calling back with
  // the same coordinates, and the old code re-tracked that byte-for-byte payload
  // and called it a keep-alive. Presence only tells peers about *changes*, so it
  // was not one, and a stationary companion went stale and then vanished with
  // their app open on their shoulder.
  world.advance(31_000);
  await world.feed();
  const next = channel.tracked[channel.tracked.length - 1];
  assert.equal(next.latitude, first.latitude, 'the position is the same place');
  assert.notEqual(next.fixedAt, first.fixedAt, 'the report is not the same report');
  assert.ok(next.seenAt > first.seenAt);
});

test('movement is floored so a car ride cannot out-run the presence rate limit', async () => {
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  channel.settleJoin();
  await world.settled();
  await world.feed(100, 30);
  assert.equal(channel.tracked.length, 1, 'the first report is never held back');

  world.advance(1_000);
  await world.feed(100, 30.02);
  assert.equal(channel.tracked.length, 1, 'one second later is too soon for the next one');
  world.advance(8_000);
  await world.feed(100, 30.04);
  assert.equal(channel.tracked.length, 2, 'eight seconds is enough');

  const before = channel.tracked.length;
  for (let minute = 0; minute < 6; minute += 1) {
    world.advance(5_000);
    await world.feed(100, 30.05 + minute * 0.01);
  }
  assert.ok(channel.tracked.length - before <= 4,
    `30 seconds of fixes a second apart must stay inside 5 presence calls, saw ${channel.tracked.length - before}`);
});

test('signing out clears the toggle the next account would otherwise inherit', async () => {
  const world = makeWorld();
  await world.startSharing('j1');
  const channel = world.channel('j1');
  channel.settleJoin();
  await world.settled();
  assert.equal(world.load('src/lib/companionPresence.ts').getSharingJourneyId(), 'j1');

  // The bundle is not reloaded on sign-out, so module state survives it: without
  // this, the next person to log in on this phone hands their position to a
  // journey they are not in.
  world.render(null);
  await world.settled();
  assert.equal(world.load('src/lib/companionPresence.ts').getSharingJourneyId(), null);
  assert.equal(channel.untracked, 1, 'and the share stopped on the way out');
});
