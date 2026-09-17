const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadPicker() {
  const effects = [];
  const listeners = [];
  const mocks = {
    react: {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
      useEffect: effect => effects.push(effect),
      useMemo: fn => fn(),
      useState: value => [typeof value === 'function' ? value() : value, () => {}],
    },
    'react-native': {
      FlatList: 'FlatList', Modal: 'Modal', Switch: 'Switch', Text: 'Text', View: 'View',
      StyleSheet: { hairlineWidth: 1 },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      BackHandler: { addEventListener: (event, callback) => {
        const listener = { event, callback, removed: false };
        listeners.push(listener);
        return { remove: () => { listener.removed = true; } };
      } },
    },
    '@quidone/react-native-wheel-picker': { default: 'WheelPicker' },
    '../../i18n': { useI18n: () => ({ t: key => key, resolved: 'zh' }) },
    '../../design-system': { radius: { pill: 99, control: 8 }, space: { xs: 4, sm: 8, lg: 24, xxxl: 40 } },
    '../Press': { Press: 'Press' },
    './NewJourneyParts': { NJBottomSheet: 'NJBottomSheet', njHapticTick() {} },
    '../../lib/journeySchedule': { journeyCalendarDays: () => 3 },
  };
  const source = fs.readFileSync('src/components/overlays/JourneyDateRangePicker.tsx', 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  mocks.react.default = mocks.react;
  const context = { exports: {}, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(js, context);
  return { render: context.exports.JourneyDateRangePicker, effects, listeners };
}

function find(node, type) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === type) return node;
  return node.props?.children.flat(Infinity).map(child => find(child, type)).find(Boolean);
}

for (const dark of [false, true]) {
  test(`inline date picker supports confirmation and back dismissal (${dark ? 'dark' : 'light'})`, () => {
    const { render, effects, listeners } = loadPicker();
    let closed = 0;
    let applied;
    const theme = { dark, featureSurface: dark ? '#111111' : '#FFFFFF' };
    const tree = render({ theme, presentation: 'inline', initialStart: new Date(2026, 8, 9), initialDurationDays: 3,
      onApply: value => { applied = value; }, onClose: () => { closed += 1; } });
    assert.equal(tree.type, 'NJBottomSheet');
    assert.equal(find(tree, 'Modal'), undefined);
    assert.equal(tree.props.backgroundColor, theme.featureSurface);
    assert.ok(find(tree, 'FlatList'));
    find(tree, 'Press').props.onPress();
    assert.equal(applied.totalDays, 3);
    assert.equal(applied.flexible, false);
    assert.equal(closed, 1);
    const cleanup = effects[0]();
    assert.equal(listeners[0].event, 'hardwareBackPress');
    assert.equal(listeners[0].callback(), true);
    assert.equal(closed, 2);
    cleanup();
    assert.equal(listeners[0].removed, true);
  });
}

test('other callers retain native modal presentation and request-close handling', () => {
  const { render, effects, listeners } = loadPicker();
  const onClose = () => {};
  const tree = render({ theme: {}, initialStart: new Date(), onApply() {}, onClose });
  assert.equal(tree.type, 'Modal');
  assert.equal(tree.props.onRequestClose, onClose);
  effects[0]();
  assert.equal(listeners.length, 0);
});
