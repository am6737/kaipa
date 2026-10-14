// Authenticated HTTP companion sharing. Original roster assertions are retained;
// transport lifecycle cases now target device leases rather than public sockets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const USER = 'user-1';
function makeWorld(start = 1_800_000_000_000) {
  const clock = { value: start };
  class FakeDate extends Date {
    static now() {
      return clock.value;
    }
  }
  let effectIndex = 0;
  const effects = [];
  const intervals = new Set();
  const watch = { callback: null, removed: 0 };
  const location = { cached: null, cacheRejects: false };
  const network = { online: true, listeners: new Set() };
  const app = {
    currentState: 'active',
    listeners: new Set(),
    addEventListener(_event, cb) {
      this.listeners.add(cb);
      return { remove: () => this.listeners.delete(cb) };
    },
  };
  const service = {
    sessions: new Map(),
    opens: 0,
    published: [],
    closed: [],
    requests: [],
    allowed: true,
    holdOpen: null,
    holdPublish: null,
    holdSnapshot: null,
  };
  const react = {
    useState: (initial) => [
      typeof initial === 'function' ? initial() : initial,
      () => {},
    ],
    useSyncExternalStore: (_s, get) => get(),
    useEffect(fn, deps) {
      const i = effectIndex++;
      const prior = effects[i];
      const changed =
        !prior || deps.some((x, j) => !Object.is(x, prior.deps[j]));
      if (changed) {
        prior?.cleanup?.();
        effects[i] = { deps, cleanup: fn() };
      }
    },
  };
  const requester = async (_url, options) => {
    const b = JSON.parse(options.body);
    service.requests.push(b);
    if (!network.online) throw new Error('network unavailable');
    if (!service.allowed)
      return { ok: false, status: 403, json: async () => ({}) };
    if (b.action === 'snapshot' && service.holdSnapshot)
      await service.holdSnapshot;
    if (b.action === 'open' && service.holdOpen) await service.holdOpen;
    if (b.action === 'publish' && service.holdPublish)
      await service.holdPublish;
    let result = {},
      status = 200;
    if (b.action === 'open') {
      const id = 'session-' + ++service.opens;
      service.sessions.set(id, {
        id,
        journeyId: b.journeyId,
        closed: false,
        position: null,
      });
      result = { sessionId: id };
    }
    if (b.action === 'close') {
      service.closed.push(b.sessionId);
      const s = service.sessions.get(b.sessionId);
      if (s) {
        s.closed = true;
        s.position = null;
      }
      result = { closed: true };
    }
    if (b.action === 'publish') {
      const s = service.sessions.get(b.sessionId);
      if (!s || s.closed) {
        status = 403;
      } else {
        result = {
          userId: USER,
          longitude: b.longitude,
          latitude: b.latitude,
          fixedAt: clock.value,
        };
        s.position = result;
        service.published.push(result);
      }
    }
    if (b.action === 'snapshot')
      result = {
        peers: [...service.sessions.values()]
          .filter((s) => s.journeyId === b.journeyId && !s.closed && s.position)
          .map((s) => s.position),
      };
    return { ok: status === 200, status, json: async () => result };
  };
  const mocks = {
    react,
    'react-native': { AppState: app },
    'expo-network': {
      getNetworkStateAsync: async () => ({
        isConnected: network.online,
        isInternetReachable: network.online,
      }),
      addNetworkStateListener: (cb) => {
        network.listeners.add(cb);
        return { remove: () => network.listeners.delete(cb) };
      },
    },
    'expo-location': {
      Accuracy: { Balanced: 1 },
      getLastKnownPositionAsync: async () => {
        if (location.cacheRejects) throw new Error('cache');
        return location.cached;
      },
      watchPositionAsync: async (_opts, callback) => {
        watch.callback = callback;
        return {
          remove() {
            watch.removed++;
          },
        };
      },
    },
    './supabase': {
      supabaseUrl: 'http://fixture',
      supabaseAnonKey: 'fixture',
      supabase: {
        auth: {
          getSession: async () => ({
            data: {
              session: {
                access_token: 'fixture',
                user: { id: USER, is_anonymous: false },
              },
            },
          }),
        },
      },
    },
  };
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(file);
    if (cache.has(resolved)) return cache.get(resolved);
    const js = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const context = {
      exports: {},
      Date: FakeDate,
      AbortController,
      fetch: requester,
      setTimeout: (fn, ms) => {
        const t = setTimeout(fn, ms);
        t.unref();
        return t;
      },
      clearTimeout,
      setInterval: (fn) => {
        intervals.add(fn);
        return fn;
      },
      clearInterval: (fn) => intervals.delete(fn),
      console,
      require: (name) => {
        if (name in mocks) return mocks[name];
        if (name.startsWith('.'))
          return load(path.resolve(path.dirname(resolved), name) + '.ts');
        throw new Error('Unexpected dependency ' + name);
      },
    };
    vm.runInNewContext(js, context);
    cache.set(resolved, context.exports);
    return context.exports;
  }
  const settled = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
  };
  const world = {
    load,
    watch,
    location,
    service,
    network,
    app,
    settled,
    now: () => clock.value,
    advance: (ms) => (clock.value += ms),
    fix: (latitude = 30) => ({
      coords: { longitude: 100, latitude },
      timestamp: clock.value,
    }),
    render(userId = USER) {
      effectIndex = 0;
      load('src/hooks/useCompanionPresence.ts').usePresencePublisher(userId);
    },
    async startSharing(journeyId) {
      load('src/lib/companionPresence.ts').setSharingJourneyId(journeyId);
      world.render();
      await settled();
    },
    async stopSharing() {
      load('src/lib/companionPresence.ts').setSharingJourneyId(null);
      world.render();
      await settled();
    },
    async feed(longitude = 100, latitude = 30) {
      watch.callback?.({
        coords: { longitude, latitude },
        timestamp: clock.value,
      });
      await settled();
    },
    async online(value) {
      network.online = value;
      for (const cb of network.listeners)
        cb({ isConnected: value, isInternetReachable: value });
      await settled();
    },
    async foreground(value) {
      app.currentState = value ? 'active' : 'background';
      for (const cb of app.listeners) cb(app.currentState);
      await settled();
    },
    async tick(ms = 10000) {
      clock.value += ms;
      for (const fn of [...intervals]) fn();
      await settled();
    },
  };
  return world;
}
const NOW = 1_800_000_000_000;

test('one companion is one entry, however many connections tracked', () => {
  const { foldPresenceRoster } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  const phone = {
    userId: 'u1',
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - 60_000,
  };
  const tablet = {
    userId: 'u1',
    longitude: 100,
    latitude: 31,
    fixedAt: NOW - 300_000,
  };
  const roster = foldPresenceRoster([[tablet], [phone]], NOW);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].latitude, 30, 'the fresher of the two fixes wins');
});

test('a roster is sorted by user so the marker memo sees a stable list', () => {
  const { foldPresenceRoster } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  const at = (id, minutes) => ({
    userId: id,
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - minutes * 60_000,
  });
  const roster = foldPresenceRoster([[at('zoe', 1)], [at('amy', 1)]], NOW);
  // join() rather than deepEqual: the module runs in its own realm, so its
  // arrays are not host Arrays and a strict deep-equal would be about realms.
  assert.equal(roster.map((peer) => peer.userId).join(','), 'amy,zoe');
});

test('incomplete or unreadable presence entries are dropped, not drawn', () => {
  const { foldPresenceRoster } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  const good = { userId: 'u1', longitude: 100, latitude: 30, fixedAt: NOW };
  const cases = [
    ['no fix time', { userId: 'u2', longitude: 100, latitude: 30 }],
    [
      'fix time as a string',
      { userId: 'u3', longitude: 100, latitude: 30, fixedAt: `${NOW}` },
    ],
    [
      'fix time NaN',
      { userId: 'u4', longitude: 100, latitude: 30, fixedAt: NaN },
    ],
    ['no user id', { longitude: 100, latitude: 30, fixedAt: NOW }],
    [
      'empty user id',
      { userId: '', longitude: 100, latitude: 30, fixedAt: NOW },
    ],
    [
      'coordinate as a string',
      { userId: 'u5', longitude: '100', latitude: 30, fixedAt: NOW },
    ],
    [
      'coordinate NaN',
      { userId: 'u6', longitude: 100, latitude: NaN, fixedAt: NOW },
    ],
    ['null entry', null],
    ['entry that is not an object', 7],
  ];
  for (const [label, bad] of cases) {
    assert.equal(foldPresenceRoster([[bad], [good]], NOW).length, 1, label);
  }
});

test('a fix older than the drop window is off the map, the boundary stays on', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  const at = (id, agoMs) => ({
    userId: id,
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - agoMs,
  });
  const roster = foldPresenceRoster(
    [
      [
        at('just-inside', PRESENCE_DROP_MS),
        at('one-ms-over', PRESENCE_DROP_MS + 1),
      ],
    ],
    NOW,
  );
  assert.equal(roster.map((peer) => peer.userId).join(','), 'just-inside');
});

test('the fold returns its own objects, so a caller cannot write through to presence state', () => {
  const { foldPresenceRoster } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  const entry = { userId: 'u1', longitude: 100, latitude: 30, fixedAt: NOW };
  const [peer] = foldPresenceRoster([[entry]], NOW);
  peer.latitude = 99;
  assert.equal(entry.latitude, 30);
});

// ---- the bus lifecycle ----

// ---- whose clock decides whether a companion is still there ----

test('freshness is measured on arrival, never on the sender** clock', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS } = makeWorld().load(
    'src/lib/companionPresence.ts',
  );
  // A phone two minutes fast used to produce a negative age in the caller, which
  // dropped it: that companion was invisible to everyone, forever, silently.
  const fast = {
    userId: 'fast',
    longitude: 100,
    latitude: 30,
    fixedAt: NOW + 5 * 60_000,
  };
  const roster = foldPresenceRoster([[fast]], NOW);
  assert.equal(roster.length, 1, 'a clock ahead of ours is still a person');
  assert.equal(roster[0].seenAt, NOW, 'and it arrives now, by our clock');
  // A phone behind is only ever a problem when the gap passes the drop window,
  // because that is the one case where the sender** stamp is the only evidence
  // that this roster entry is not a leftover from before we joined.
  const slow = {
    userId: 'slow',
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - 25 * 60_000,
  };
  assert.equal(
    foldPresenceRoster([[slow]], NOW).length,
    1,
    '25 minutes behind is still drawn',
  );
  const ancient = {
    userId: 'ancient',
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - PRESENCE_DROP_MS - 1,
  };
  assert.equal(
    foldPresenceRoster([[ancient]], NOW).length,
    0,
    'past the window it is not',
  );
});

test('an entry is only refreshed by news about that same user', () => {
  const { foldPresenceRoster, PRESENCE_DROP_MS, PRESENCE_STALE_MS } =
    makeWorld().load('src/lib/companionPresence.ts');
  const quiet = {
    userId: 'still',
    longitude: 100,
    latitude: 30,
    fixedAt: NOW - 60_000,
  };
  const first = foldPresenceRoster([[quiet]], NOW);
  assert.equal(first[0].seenAt, NOW);

  const later = NOW + 180_000;
  const noisy = {
    userId: 'other',
    longitude: 101,
    latitude: 31,
    fixedAt: later,
  };
  const second = foldPresenceRoster([[quiet], [noisy]], later, first);
  assert.equal(second.length, 2);
  assert.equal(
    second.find((peer) => peer.userId === 'still').seenAt,
    NOW,
    'someone else moving is not a report from this one',
  );
  assert.ok(
    later - second.find((peer) => peer.userId === 'still').seenAt >
      PRESENCE_STALE_MS,
    'so its ring does go grey, which is the point',
  );

  const restamped = { ...quiet, fixedAt: later };
  const third = foldPresenceRoster([[restamped]], later, second);
  assert.equal(
    third.find((peer) => peer.userId === 'still').seenAt,
    later,
    'a new stamp from the same user is a report',
  );
  assert.equal(
    foldPresenceRoster([[quiet]], NOW + PRESENCE_DROP_MS + 1, first).length,
    0,
    'and half an hour without one takes it off the map',
  );
});

test('one journey has one snapshot bus; a live reference survives release', async () => {
  const w = makeWorld();
  const lib = w.load('src/lib/companionPresenceBus.ts');
  const first = lib.acquireBus('j1'),
    second = lib.acquireBus('j1');
  assert.equal(first, second);
  assert.equal(first.refs, 2);
  lib.releaseBus('j1', first);
  assert.equal(first.refs, 1);
  assert.equal(lib.acquireBus('j1'), first);
  lib.releaseBus('j1', first);
  lib.releaseBus('j1', first);
  assert.equal(first.refs, 0);
  assert.notEqual(
    lib.acquireBus('j1'),
    first,
    'idle bus is replaced without a departing socket',
  );
  await w.settled();
});
test('a late snapshot from a released bus cannot update a reopened map', async () => {
  const w = makeWorld();
  const lib = w.load('src/lib/companionPresenceBus.ts');
  let resolve;
  w.service.holdSnapshot = new Promise((r) => (resolve = r));
  w.service.sessions.set('fixture', {
    journeyId: 'j1',
    closed: false,
    position: { userId: USER, longitude: 110, latitude: 25, fixedAt: NOW },
  });
  const old = lib.acquireBus('j1');
  let oldUpdates = 0;
  old.listeners.add(() => oldUpdates++);
  await w.settled();
  lib.releaseBus('j1', old);
  const next = lib.acquireBus('j1');
  assert.notEqual(old, next);
  await w.settled();
  resolve();
  await w.settled();
  assert.equal(old.peers.length, 0);
  assert.equal(oldUpdates, 0);
  assert.equal(next.peers.length, 1);
});
test('a bus in use is never evicted when many other journeys open', async () => {
  const w = makeWorld();
  const lib = w.load('src/lib/companionPresenceBus.ts');
  const live = lib.acquireBus('shared');
  for (let i = 0; i < 12; i++) {
    const b = lib.acquireBus('j' + i);
    lib.releaseBus('j' + i, b);
  }
  assert.equal(lib.acquireBus('shared'), live);
  await w.settled();
});
test('a session with no cached fix still starts the location watch', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  assert.ok(w.watch.callback);
  await w.feed();
  assert.equal(w.service.published.length, 1);
});
test('a rejected cache lookup still starts the location watch', async () => {
  const w = makeWorld();
  w.location.cacheRejects = true;
  await w.startSharing('j1');
  assert.ok(w.watch.callback);
});
test('a cached fix goes out after server authorization before device moves', async () => {
  const w = makeWorld();
  w.location.cached = w.fix(30.002);
  let resolve;
  w.service.holdOpen = new Promise((r) => (resolve = r));
  await w.startSharing('j1');
  assert.equal(w.service.published.length, 0);
  resolve();
  await w.settled();
  assert.equal(w.service.published.length, 1);
});
test('turning sharing off closes immediately while map snapshot bus remains live', async () => {
  const w = makeWorld();
  const lib = w.load('src/lib/companionPresenceBus.ts');
  const b = lib.acquireBus('j1');
  await w.startSharing('j1');
  await w.feed();
  await w.stopSharing();
  assert.equal(w.service.closed.length, 1);
  assert.equal(w.watch.removed, 1);
  assert.equal(b.refs, 1);
  assert.equal(
    w.load('src/lib/companionPresence.ts').useLastSelfPresence(),
    null,
  );
});
test('sharing again after stop gets a fresh lease and old close cannot remove it', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  await w.stopSharing();
  await w.startSharing('j1');
  await w.feed(100, 30.01);
  assert.equal(w.service.opens, 2);
  assert.equal(w.service.published.length, 2);
  assert.equal(
    [...w.service.sessions.values()].filter((s) => !s.closed).length,
    1,
  );
});
test('the keep-alive advances the server publication stamp', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  const first = w.service.published[0];
  await w.tick(31000);
  const next = w.service.published.at(-1);
  assert.equal(next.latitude, first.latitude);
  assert.ok(next.fixedAt > first.fixedAt);
});
test('movement is floored so a car ride cannot flood publication', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  w.advance(1000);
  await w.feed(100, 30.02);
  assert.equal(w.service.published.length, 1);
  w.advance(8000);
  await w.feed(100, 30.04);
  assert.equal(w.service.published.length, 2);
  const before = w.service.published.length;
  for (let i = 0; i < 6; i++) {
    w.advance(5000);
    await w.feed(100, 30.05 + i * 0.01);
  }
  assert.ok(w.service.published.length - before <= 4);
});
test('signing out clears the toggle and closes old account lease', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  w.render(null);
  await w.settled();
  assert.equal(
    w.load('src/lib/companionPresence.ts').getSharingJourneyId(),
    null,
  );
  assert.equal(w.service.closed.length, 1);
});
test('offline pauses location publication; reconnect reauthorizes rather than replaying queue', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  await w.online(false);
  await w.feed(120, 40);
  await w.tick();
  assert.equal(w.service.published.length, 1);
  assert.equal(
    w.load('src/lib/companionPresence.ts').useLastSelfPresence(),
    null,
  );
  w.service.allowed = false;
  await w.online(true);
  assert.equal(w.service.published.length, 1);
  assert.equal(
    w.load('src/lib/companionPresence.ts').getSharingJourneyId(),
    null,
  );
});
test('foreground restoration opens a new lease and background cannot publish', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  await w.foreground(false);
  await w.tick();
  assert.equal(w.service.closed.length, 1);
  assert.equal(w.service.published.length, 1);
  await w.foreground(true);
  await w.feed();
  assert.equal(w.service.opens, 2);
  assert.equal(w.service.published.length, 2);
});
test('late open after off is closed and cannot start a watch', async () => {
  const w = makeWorld();
  let resolve;
  w.service.holdOpen = new Promise((r) => (resolve = r));
  await w.startSharing('j1');
  await w.stopSharing();
  resolve();
  await w.settled();
  assert.equal(w.service.closed.length, 1);
  assert.equal(w.watch.callback, null);
});
test('late publish after off cannot restore self pin or resurrect device', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  let resolve;
  w.service.holdPublish = new Promise((r) => (resolve = r));
  await w.feed();
  await w.stopSharing();
  resolve();
  await w.settled();
  assert.equal(
    w.load('src/lib/companionPresence.ts').useLastSelfPresence(),
    null,
  );
  assert.equal(w.service.published.length, 0);
});
test('revocation rejects each publish and clears self pin and intent', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  w.service.allowed = false;
  w.advance(9000);
  await w.feed();
  assert.equal(w.service.published.length, 1);
  assert.equal(
    w.load('src/lib/companionPresence.ts').getSharingJourneyId(),
    null,
  );
  assert.equal(
    w.load('src/lib/companionPresence.ts').useLastSelfPresence(),
    null,
  );
});

test('legal reconnect uses a fresh authorized session and new GPS fix', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  await w.online(false);
  await w.online(true);
  assert.equal(w.service.opens, 2);
  assert.equal(w.service.published.length, 1);
  await w.feed(111, 26);
  assert.equal(w.service.published.length, 2);
  assert.equal(w.service.published[1].longitude, 111);
});
test('snapshot authorization failure clears peers from an already open viewer', async () => {
  const w = makeWorld();
  await w.startSharing('j1');
  await w.feed();
  const bus = w.load('src/lib/companionPresenceBus.ts').acquireBus('j1');
  await w.settled();
  assert.equal(bus.peers.length, 1);
  w.service.allowed = false;
  await w.tick(3000);
  assert.equal(bus.peers.length, 0);
});
