const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadMap() {
  const calls = [];
  const effects = [];
  let effectIndex = 0;
  const camera = Object.fromEntries(['fitCoordinates', 'moveCamera', 'resetNorth'].map(name => [
    name, (...args) => calls.push({ name, args }),
  ]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useRef: () => ({ current: camera }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: (fn, deps) => {
      const index = effectIndex++;
      const previous = effects[index];
      effects[index] = { deps, fn, changed: !previous || deps.some((value, i) => !Object.is(value, previous.deps[i])) };
    },
  };
  react.default = react;
  const mocks = {
    react,
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable',
      StyleSheet: { create: styles => styles, absoluteFill: {}, hairlineWidth: 1 },
      useWindowDimensions: () => ({ height: 844 }),
    },
    '../Icon': { Icon: 'Icon' },
    '../maps/NativeMap': { NativeMap: 'NativeMap' },
    '../maps/types': { isValidMapCoordinate: coord => coord.every(Number.isFinite) },
    './PhotoPin': { PhotoPin: 'PhotoPin', photoPinScaleForZoom: () => 1 },
  };
  const js = ts.transpileModule(fs.readFileSync('src/components/globe/MapGlobe.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(js, context);
  return {
    calls,
    render(props) {
      effectIndex = 0;
      const tree = context.exports.default(props);
      effects.forEach(effect => { if (effect.changed) effect.fn(); });
      return tree.props.children[0];
    },
  };
}

for (const dark of [false, true]) {
  test(`sheet framing pauses after a gesture and resumes on route reset (${dark ? 'dark' : 'light'})`, () => {
    const { render, calls } = loadMap();
    const props = {
      theme: { dark }, pois: [], focusCoords: [[100, 30], [101, 31]],
      focusBottomPadding: 450, autoFrameRoute: true,
      onCameraGestureStart: () => { props.autoFrameRoute = false; },
    };
    let map = render(props);
    assert.equal(calls.length, 1);
    props.focusBottomPadding = 100;
    map = render(props);
    assert.equal(calls.at(-1).args[1][2], 100);
    props.focusBottomPadding = 450;
    map = render(props);
    assert.equal(calls.at(-1).args[1][2], 450);
    map.props.onGestureStart();
    const count = calls.length;
    render(props);
    props.focusBottomPadding = 100;
    render(props);
    props.focusBottomPadding = 450;
    render(props);
    assert.equal(calls.length, count);
    props.autoFrameRoute = true;
    props.cameraAction = { type: 'fitRoute', revision: 1 };
    render(props);
    assert.equal(calls.at(-1).args[2], 650);
    props.focusBottomPadding = 100;
    render(props);
    assert.equal(calls.at(-1).args[1][2], 100);
    assert.equal(calls.at(-1).args[2], 250);
  });
}

test('explicit camera commands remain available while automatic framing is paused', () => {
  const { render, calls } = loadMap();
  const props = { theme: {}, pois: [], focusCoords: [[100, 30]], autoFrameRoute: false };
  render(props);
  assert.equal(calls.length, 0);
  render({ ...props, cameraAction: { type: 'fitRoute', revision: 1 } });
  assert.equal(calls.at(-1).name, 'moveCamera');
  render({ ...props, cameraAction: { type: 'resetNorth', revision: 2 } });
  assert.equal(calls.at(-1).name, 'resetNorth');
});
