const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, overrides = {}) {
  const filename = path.resolve(file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = name => overrides[name] ?? (name.startsWith('.')
    ? load(path.resolve(path.dirname(filename), `${name}.ts`), overrides) : require(name));
  new Function('exports', 'require', 'module', 'setTimeout', 'clearTimeout', code)(
    module.exports, localRequire, module, overrides.setTimeout ?? setTimeout, overrides.clearTimeout ?? clearTimeout);
  return module.exports;
}
const { buildJourneyStops, buildJourneyLegs } = load('src/lib/journeyStops.ts');
const road = [[100, 30], [100.02, 30.015], [100.03, 30.03]];
const signature = leg => `${leg.mode}:${leg.from.map(v => v.toFixed(5)).join(',')}:${leg.to.map(v => v.toFixed(5)).join(',')}`;
function harness(planner) {
  const slots = [];
  const timers = new Map();
  const calls = [];
  let cursor = 0, dirty = false, inputs, output;
  const effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      return [slots[i].value, value => {
        slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;
        dirty = true;
      }];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const { useJourneyLegGeometry } = load('src/hooks/useJourneyLegGeometry.ts', {
    react,
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async () => null, setItem: async () => {},
    } },
    '../lib/amapGeocoding': { planJourneyDirections: async (legs, signal, onLeg) => {
      calls.push({ legs, signal });
      await planner(legs, signal, onLeg, calls.length);
    } },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  function render(legs = inputs, enabled = true) {
    inputs = legs;
    cursor = 0;
    dirty = false;
    output = useJourneyLegGeometry(legs, enabled);
    effects.splice(0).forEach(fn => fn());
    return output;
  }
  async function settle() {
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setImmediate(resolve));
      if (dirty) render();
    }
    return output;
  }
  async function retry() {
    const timer = [...timers].find(([, value]) => value.delay !== 400);
    assert.ok(timer, 'expected a pending retry');
    timers.delete(timer[0]);
    timer[1].fn();
    return settle();
  }
  return { render, settle, retry, calls, timers };
}
const place = (id, day, lng, sortOrder) => ({
  id, title: id, day, sortOrder, location: { name: id, longitude: lng, latitude: 30 },
});
const chain = rows => buildJourneyLegs(buildJourneyStops(rows, ['Day 1', 'Day 2']));

test('adding yesterday’s last place then moving it to first replans only changed directed pairs', async () => {
  const h = harness(async (legs, signal, onLeg) => {
    legs.forEach(leg => onLeg({ ...leg, coordinates: road, attempted: true }));
  });
  const rows = [place('yesterday', 'Day 1', 100, 0), place('a', 'Day 2', 100.01, 0), place('b', 'Day 2', 100.03, 1)];
  h.render(chain(rows));
  await h.settle();
  const added = [...rows, place('copy', 'Day 2', 100, 2)];
  h.render(chain(added));
  await h.settle();
  const moved = added.map(row => ({ ...row, sortOrder: row.id === 'copy' ? 0 : row.sortOrder + 1 }));
  const legs = chain(moved);
  h.render(legs);
  const output = await h.settle();
  assert.deepEqual(legs.map(leg => leg.id), ['copy->a', 'a->b']);
  assert.deepEqual(h.calls.at(-1).legs.map(leg => leg.id), [signature(legs[0])]);
  assert.ok(output['copy->a'].length >= 2);
  assert.ok(output['a->b'].length >= 2);
});

for (const failure of ['network', 'quota', 'legacy']) {
  test(`${failure} failure retries without another itinerary edit`, async () => {
    const h = harness(async (legs, signal, onLeg, count) => {
      if (count === 1 && failure === 'network') throw new Error('offline');
      legs.forEach(leg => onLeg({ ...leg, coordinates: count === 1 ? null : road,
        ...(failure === 'legacy' && count === 1 ? {} : { attempted: count !== 1 }) }));
    });
    h.render(chain([place('a', 'Day 2', 100, 0), place('b', 'Day 2', 100.03, 1)]));
    assert.deepEqual(await h.settle(), {});
    const output = await h.retry();
    assert.ok(output['a->b'].length >= 2);
    assert.equal(h.calls.length, 2);
  });
}

test('a partial response keeps the successful road and retries only the missing road', async () => {
  const h = harness(async (legs, signal, onLeg, count) => {
    onLeg({ ...legs[0], coordinates: road, attempted: true });
    if (count === 1) throw new Error('second batch failed');
  });
  h.render(chain([place('a', 'Day 2', 100, 0), place('b', 'Day 2', 100.03, 1), place('c', 'Day 2', 100.06, 2)]));
  assert.ok((await h.settle())['a->b']);
  assert.equal(h.calls[0].signal.aborted, false, 'publishing geometry must not abort the batch');
  assert.ok((await h.retry())['b->c']);
  assert.equal(h.calls[1].legs.length, 1);
});

test('retries are bounded and cancelled when the itinerary changes', async () => {
  const h = harness(async () => { throw new Error('offline'); });
  h.render(chain([place('a', 'Day 2', 100, 0), place('b', 'Day 2', 100.03, 1)]));
  await h.settle();
  for (let i = 0; i < 3; i++) await h.retry();
  assert.equal(h.calls.length, 4);
  assert.equal(h.timers.size, 0);
  h.render(chain([place('b', 'Day 2', 100.03, 0), place('a', 'Day 2', 100, 1)]));
  await h.settle();
  assert.ok(h.timers.size);
  h.render([]);
  await h.settle();
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.at(-1).signal.aborted, true);
});

test('an explicit no-route verdict is tried again after reopening, without automatic retries', async () => {
  const h = harness(async (legs, signal, onLeg, count) => {
    legs.forEach(leg => onLeg({ ...leg, coordinates: count === 1 ? null : road, attempted: true }));
  });
  const legs = chain([place('a', 'Day 2', 100, 0), place('b', 'Day 2', 100.03, 1)]);
  h.render(legs);
  await h.settle();
  assert.equal(h.timers.size, 0);
  h.render([]);
  await h.settle();
  h.render(legs);
  assert.ok((await h.settle())['a->b']);
});


test('unresolved track legs neither request AMap nor reuse cached road geometry', async () => {
  const h = harness(async (legs, signal, onLeg) => {
    legs.forEach(leg => onLeg({ ...leg, coordinates: road, attempted: true }));
  });
  const legs = chain([place('a', 'Day 2', 100, 0), place('b', 'Day 2', 100.03, 1)]);
  h.render(legs);
  assert.ok((await h.settle())['a->b']);
  h.render(legs.map(leg => ({ ...leg, pendingTrack: true })));
  assert.deepEqual(await h.settle(), {});
  assert.equal(h.calls.length, 1);
  h.render([{ ...legs[0], id: 'new-track-leg', pendingTrack: true, to: [100.05, 30] }]);
  assert.deepEqual(await h.settle(), {});
  assert.equal(h.calls.length, 1);
});

for (const response of ['connected', 'gap', 'legacy']) {
  test(`track access accepts only verified connected roads: ${response}`, async () => {
    const from = [100, 29.99], entrance = [100, 30], to = [100.01, 30.01];
    const h = harness(async (legs, signal, onLeg) => {
      legs.forEach(leg => onLeg({ ...leg, coordinates: [from, entrance], attempted: true,
        ...(response === 'legacy' ? {} : {
          actualFrom: from, actualTo: response === 'gap' ? [100, 29.98] : entrance,
        }),
      }));
    });
    const leg = { id: 'poi->camp', mode: 'walking', from, to, day: 'Day 2',
      pendingTrack: true, trackBridge: true, directionFrom: from, directionTo: entrance,
      recordedSuffix: [entrance, [100.01, 30], to], directMeters: 2000 };
    h.render([leg]);
    const output = await h.settle();
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].legs[0].to, entrance);
    if (response === 'connected') {
      assert.deepEqual(output[leg.id], [from, entrance, [100.01, 30], to]);
      h.render([leg]);
      assert.deepEqual(await h.settle(), output);
    } else {
      assert.deepEqual(output, {});
      assert.equal(h.timers.size, 0);
    }
  });
}
