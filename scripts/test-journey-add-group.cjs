const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mockedRequire) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(mockedRequire, module, module.exports);
  return module.exports;
}

const days = load('src/lib/journeyDays.ts', () => ({}));
const stored = new Map();
let slots, cursor, effects, cleanups = [];
const react = {
  useState(initial) {
    const state = slots, index = cursor++;
    state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], (value) => { state[index] = value; }];
  },
  useRef(initial) { return slots[cursor++] = { current: initial }; },
  useEffect(effect) { effects.push(effect); },
};
const storage = {
  getItem: async (key) => stored.get(key) ?? null,
  setItem: async (key, value) => { stored.set(key, value); },
};
const { useLastAddedGroup } = load('src/components/journey/useLastAddedGroup.ts', (name) =>
  name === 'react' ? react : name.includes('async-storage') ? storage : days);

function mount(key, initialDay = 'Day 4', editing = false, groups = ['Day 4', 'Day 5']) {
  cleanups.forEach((cleanup) => cleanup?.());
  slots = []; cursor = 0; effects = [];
  const hook = useLastAddedGroup(key, initialDay, 'Day 4', groups, editing);
  cleanups = effects.map((effect) => effect());
  return hook;
}

async function main() {
  // The footer passes the viewed fourth day on every open. Choosing the fifth
  // day must still carry over to the next open, both from memory and storage.
  mount('journey-a').selectDay('Day 5');
  assert.equal(mount('journey-a').day, 'Day 5');
  stored.set('cold-start', '第五天');
  mount('cold-start');
  await Promise.resolve();
  assert.equal(slots[0], 'Day 5');

  assert.equal(mount('another-journey').day, 'Day 4');
  const edit = mount('journey-a', 'Day 4', true);
  assert.equal(edit.day, 'Day 4');
  edit.selectDay('');
  assert.equal(stored.get('journey-a'), 'Day 5');

  mount('journey-a').selectDay('');
  assert.equal(mount('journey-a').day, '');
  stored.set('deleted-group', 'Day 5');
  mount('deleted-group', 'Day 4', false, ['Day 4']);
  await Promise.resolve();
  assert.equal(slots[0], 'Day 4');

  stored.set('slow-restore', 'Day 5');
  mount('slow-restore').selectDay('Day 4');
  await Promise.resolve();
  assert.equal(slots[0], 'Day 4');
  console.log('Journey add group regression checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
