const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/components/journey/JourneyChecklistTab.tsx');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ['packingItemTotalWeight', 'buildPackingWeightStats'];
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && functions.includes(node.name?.text));
assert.equal(declarations.length, functions.length);
const javascript = ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({});
vm.runInContext(javascript, context);
const stats = items => JSON.parse(JSON.stringify(context.buildPackingWeightStats(items)));
const item = (weightKg, quantity, carryStatus, packed = false) => ({ weightKg, quantity, carryStatus, packed });

assert.deepEqual(stats([]), { baseWeight: 0, packWeight: 0, wornWeight: 0, consumableWeight: 0, itemCount: 0, pendingCount: 0 });
const items = [item(1.2, 1, 'packed', true), item(0.5, 2, 'consumable'), item(0.8, 1, 'worn', true), item(0.3, 1, 'optional')];
assert.deepEqual(stats(items), { baseWeight: 1.2, packWeight: 2.2, wornWeight: 0.8, consumableWeight: 1, itemCount: 5, pendingCount: 3 });
assert.equal(stats(items.map(row => ({ ...row, packed: true }))).packWeight, 2.2, 'preparation must not change planned pack weight');
assert.equal(stats(items.map(row => ({ ...row, packed: true }))).pendingCount, 0);
assert.equal(stats([item(undefined, 1, 'packed')]).packWeight, 0);
assert.equal(stats([item(-1, 0, 'packed')]).packWeight, 0);
assert.equal(stats([item(-1, 0, 'packed')]).itemCount, 1);

const packingRow = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PackingRow');
let libraryBadgeCondition;
let consumableBadge;
function findLibraryBadge(node) {
  if (ts.isConditionalExpression(node) && node.whenTrue.getText(ast).includes("accessibilityLabel={t('journey.packing.notInGearLibrary')}")) {
    libraryBadgeCondition = node.condition.getText(ast);
  }
  if (ts.isConditionalExpression(node) && node.whenTrue.getText(ast).includes("t('gear.status.consumable')")) {
    consumableBadge = node;
  }
  ts.forEachChild(node, findLibraryBadge);
}
findLibraryBadge(packingRow);
assert(libraryBadgeCondition, 'keep the gear library badge conditional');
const showsLibraryBadge = new Function('item', `return ${libraryBadgeCondition};`);
assert(consumableBadge, 'show consumables directly in the checklist');
const showsConsumableBadge = new Function('item', `return ${consumableBadge.condition.getText(ast)};`);
assert(consumableBadge.whenTrue.getText(ast).includes('theme.fieldSurface'));
assert(consumableBadge.whenTrue.getText(ast).includes('theme.text2'), 'use subdued semantic colors in both themes');
for (const carryStatus of ['packed', 'worn', 'optional', 'consumable']) {
  assert.equal(showsLibraryBadge({ inGearLibrary: true, carryStatus }), false);
  assert.equal(showsLibraryBadge({ inGearLibrary: false, carryStatus }), carryStatus !== 'consumable', 'consumables do not need gear library maintenance');
  for (const inGearLibrary of [true, false]) {
    for (const packed of [true, false]) {
      assert.equal(showsConsumableBadge({ inGearLibrary, carryStatus, packed }), carryStatus === 'consumable', 'consumable labels stay visible regardless of library or preparation status');
    }
  }
}

// Guard the adopted layout and member-only navigation against a reintroduced shared entry.
assert(source.includes("controller.views.filter((view) => view.kind === 'personal')"));
assert(!source.includes("t('journey.packing.sharedShort')"));
assert(!source.includes('filterAnchorRef'));
const card = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'PackingWeightOverviewCard').getText(ast);
assert(card.includes('<ParticipantAvatar'));
assert(card.includes("t('journey.packing.progress'"));
assert(!card.includes('borderWidth') && !card.includes('boxShadow'));
assert(card.includes("t('gear.pack.base')} + {t('gear.pack.consumable')"), 'keep the pack weight calculation visible');
assert(card.includes('splitWeight(stats.packWeight, weightUnit)'), 'weight unit must be styled separately from the main value');
assert(card.includes('expanded: listPickerOpen') && card.includes("outputRange: ['0deg', '180deg']"), 'picker chevron must reflect the real expanded state');
assert(card.includes('return () => animation.stop()'), 'interrupt the chevron animation cleanly when visibility changes');
assert(source.includes('listPickerOpen={filterMenuOpen}'));
const journeyCard = fs.readFileSync(path.join(__dirname, '../src/screens/JourneyCard.tsx'), 'utf8');
const discover = fs.readFileSync(path.join(__dirname, '../src/screens/DiscoverScreen.tsx'), 'utf8');
assert(journeyCard.includes('filterMenuOpen={checklistFilterMenuOpen}'));
assert(discover.includes('checklistFilterMenuOpen={checklistFilterMenuOpen}') && discover.includes('visible={checklistFilterMenuOpen}'), 'sheet and arrow must share visibility state');
assert(discover.includes('animateChecklistPicker(open);\n    setChecklistFilterMenuOpen(open);'), 'start the native chevron animation before the picker render');
assert(discover.includes('onDismissStart={() => animateChecklistPicker(false)}'), 'reverse the chevron when dismissal starts, not after the sheet exits');
assert(card.includes('if (controlledPickerProgress) return;'), 'render effects must not restart the event-driven animation');
const picker = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'JourneyChecklistPickerContent').getText(ast);
assert(picker.includes('TextInput') && picker.includes('controller.select(option.key)'));
assert(!picker.includes("t('common.close')"), 'picker header must not show a close button');
assert(!picker.includes('AppProgressBar'), 'B3 picker uses compact counts, not per-member progress bars');
assert(!picker.includes('theme.accentSoft'), 'selected checklist must not tint the row background');
assert(picker.includes('checked: selected') && picker.includes('selected ? <Icon name="check"'), 'keep accessible selection and a visible checkmark');
assert(source.includes('data.profile.nick.trim()'), 'use the current member name instead of My checklist in the picker');
assert(picker.includes("option.kind === 'mine'") && picker.includes("t('journey.packing.me')"), 'identify the current member independently of selection');
console.log('Journey checklist presentation tests passed.');
