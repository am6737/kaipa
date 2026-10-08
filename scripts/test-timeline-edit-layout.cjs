const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

// Render the actual item with lightweight host primitives. Browsing keeps the
// regular inset; only visible editing controls reserve additional space.
const filename = 'src/components/overlays/JourneyTimeline.tsx';
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const item = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ItineraryItem');
assert.ok(item, 'ItineraryItem must exist');
const code = ts.transpileModule(item.getText(source), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() });
const react = { createElement, startTransition: fn => fn() };
class Value {
  stopAnimation() {}
  interpolate() { return 1; }
}
const tokensSource = fs.readFileSync('src/design-system/tokens.ts', 'utf8');
const tokensCode = ts.transpileModule(tokensSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const tokens = { exports: {} };
new Function('exports', 'require', 'module', tokensCode)(tokens.exports, () => ({ MONO: 'monospace' }), tokens);
const globals = {
  React: react, useRef: value => ({ current: value }), useEffect: () => {}, useContext: () => false,
  useI18n: () => ({ t: key => key }),
  Animated: { Value, View: 'Animated.View' }, Easing: { out: value => value, cubic: 0 },
  View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', Icon: 'Icon',
  StyleSheet: { absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } },
  ...tokens.exports,
  PressDragGuardContext: {},
  useDragCancelledPress: onPress => ({ onPress }),
  fmtRange: () => '08:00',
};
const renderItem = new Function(...Object.keys(globals), `${code}\nreturn ItineraryItem;`)(...Object.values(globals));
function flow(node) {
  if (node == null || node === false) return null;
  if (typeof node !== 'object') return node;
  const style = Object.assign({}, ...[node.props.style].flat().filter(Boolean));
  if (style.position === 'absolute') return null;
  return { type: node.type, style, children: node.children.map(flow).filter(child => child != null) };
}
const theme = { text: '#000', text2: '#555', text3: '#888', surfaceTop: '#fff', fieldSurface: '#eee', accent: '#080' };
const fixtures = [
  { id: 'short', title: '午餐', day: 'Day 1' },
  { id: 'long', title: '从营地出发，沿山谷前往下一个休息点，补水后继续前往山口', day: 'Day 1', timeStart: 480, location: { name: '山口' } },
  { id: 'photos', title: '风景', day: 'Day 1', media: [{ uri: 'one' }, { uri: 'two' }] },
  { id: 'grid', title: '', day: 'Day 1', media: [{ uri: 'one' }, { uri: 'two' }, { uri: 'three' }] },
];
for (const row of fixtures) {
  test(`${row.id}: control rails exist only while editing`, () => {
    const normal = renderItem({ theme, row, dayLayout: true, onPress: () => {} });
    const edit = renderItem({ theme, row, dayLayout: true, selectionMode: true, selected: false, reorderHandle: createElement('Handle'), onToggleSelected: () => {} });
    const normalFlow = flow(normal);
    const editFlow = flow(edit);
    assert.deepEqual(editFlow.children, normalFlow.children);
    assert.deepEqual({ ...editFlow.style, paddingLeft: undefined, paddingRight: undefined }, normalFlow.style);
    const style = normal.props.style;
    assert.equal(style.paddingVertical, 16);
    assert.equal(style.paddingHorizontal, 16);
    assert.equal(style.paddingLeft, undefined);
    assert.equal(style.paddingRight, undefined);
    assert.equal(edit.props.style.paddingLeft, 40);
    assert.equal(edit.props.style.paddingRight, 40);
    assert.ok(!normal.children.some(child => child?.props?.style?.position === 'absolute'));
    assert.equal(style.minHeight, undefined);
    assert.equal(edit.props.style.minHeight, undefined);
    assert.equal(edit.props.style.paddingVertical, 16);
    const selector = edit.children.find(child => child?.props?.style?.left === 8);
    assert.equal(selector.children[0].props.style.width, 18);
    assert.equal(selector.children[0].props.style.height, 18);
    const circleLeft = selector.props.style.left + (selector.props.style.width - 18) / 2;
    assert.ok(circleLeft >= 8, 'Circle needs space from the card edge');
    assert.ok(edit.props.style.paddingLeft - circleLeft - 18 >= 8, 'Circle needs space from the text');
    const handle = edit.children.find(child => child?.props?.style?.right === 4);
    const iconRight = handle.props.style.right + (handle.props.style.width - 20) / 2;
    assert.ok(iconRight >= 8, 'Handle needs space from the card edge');
    assert.ok(edit.props.style.paddingRight - iconRight - 20 >= 8, 'Handle needs space from the text');
    const selected = renderItem({ theme, row, dayLayout: true, selectionMode: true, selected: true, reorderHandle: createElement('Handle'), onToggleSelected: () => {} });
    assert.deepEqual(flow(selected), flow(edit));
    const selectionOnly = renderItem({ theme, row, dayLayout: true, selectionMode: true });
    assert.equal(selectionOnly.props.style.paddingLeft, 40);
    assert.equal(selectionOnly.props.style.paddingRight, undefined);
  });
}
