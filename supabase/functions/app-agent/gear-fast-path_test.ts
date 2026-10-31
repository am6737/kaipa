import { assertEquals } from 'jsr:@std/assert@1';
import { gearCategoryFor, gearFastPathReply, parseGearAdd, type GearFastPathInput } from './gear-fast-path.ts';
import { intentCases } from './intent-cases.ts';

const categories = [
  { id: 'c-pack', name: '背负系统' }, { id: 'c-shelter', name: '庇护系统' }, { id: 'c-sleep', name: '睡眠系统' },
  { id: 'c-wear', name: '服饰系统' }, { id: 'c-food', name: '饮食系统' }, { id: 'c-nav', name: '电子导航' },
  { id: 'c-safety', name: '安全急救' }, { id: 'c-other', name: '其他' },
];
const input = (message: string, extra: Partial<GearFastPathInput> = {}): GearFastPathInput =>
  ({ message, journeyId: null, appIntent: null, hasAttachments: false, pendingQuestion: false, ...extra });
const parse = (message: string, extra: Partial<GearFastPathInput> = {}) => parseGearAdd(input(message, extra), categories);
// [name, quantity, weightKg, priceCny]
const slots = (message: string) => {
  const result = parse(message);
  return result.match ? result.items.map(item => [item.name, item.quantity, item.weightKg, item.priceCny]) : result.reason;
};

Deno.test('gear fast path extracts every named item with its stated slots', () => {
  const cases: Array<[string, ReturnType<typeof slots>]> = [
    ['添加装备：黑钻头灯、2L水袋、萨洛蒙登山鞋', [['黑钻头灯', 1, 0, 0], ['2L水袋', 1, 0, 0], ['萨洛蒙登山鞋', 1, 0, 0]]],
    ['帮我加一下始祖鸟冲锋衣、火枫炉头、防晒袖套', [['始祖鸟冲锋衣', 1, 0, 0], ['火枫炉头', 1, 0, 0], ['防晒袖套', 1, 0, 0]]],
    ['添加装备：MSR Hubba 帐篷 1.3kg 2800元，羽绒睡袋，登山杖两根', [['MSR Hubba 帐篷', 1, 1.3, 2800], ['羽绒睡袋', 1, 0, 0], ['登山杖', 2, 0, 0]]],
    ['添加装备：鹅绒睡袋 850g，羽绒马甲 320克', [['鹅绒睡袋', 1, 0.85, 0], ['羽绒马甲', 1, 0.32, 0]]],
    ['添加装备\n防潮垫\n充气枕\n营地灯', [['防潮垫', 1, 0, 0], ['充气枕', 1, 0, 0], ['营地灯', 1, 0, 0]]],
    ['加三个气罐、两双羊毛袜', [['气罐', 3, 0, 0], ['羊毛袜', 2, 0, 0]]],
    ['加个头盔', [['头盔', 1, 0, 0]]],
    ['再加一个水壶', [['水壶', 1, 0, 0]]],
    ['添加装备：Osprey Exos 58 背包', [['Osprey Exos 58 背包', 1, 0, 0]]],
    ['把我新买的 MSR 帐篷加到装备库', [['MSR 帐篷', 1, 0, 0]]],
    ['把头灯和水袋都加到装备库', [['头灯', 1, 0, 0], ['水袋', 1, 0, 0]]],
    ['录入装备：头巾、手套、雪套、太阳镜、防晒霜、护膝、哨子、保温杯', [['头巾', 1, 0, 0], ['手套', 1, 0, 0], ['雪套', 1, 0, 0], ['太阳镜', 1, 0, 0], ['防晒霜', 1, 0, 0], ['护膝', 1, 0, 0], ['哨子', 1, 0, 0], ['保温杯', 1, 0, 0]]],
    ['添加到装备库：炉头 ×2，钛锅 ¥199', [['炉头', 2, 0, 0], ['钛锅', 1, 0, 199]]],
    ['添加装备：3块速干毛巾，头灯 150块钱', [['速干毛巾', 3, 0, 0], ['头灯', 1, 0, 150]]],
    ['添加装备：不锈钢水杯', [['不锈钢水杯', 1, 0, 0]]],
    ['添加装备：双肩包、套头衫', [['双肩包', 1, 0, 0], ['套头衫', 1, 0, 0]]],
    ['add a water filter and a sit pad to my gear', [['water filter', 1, 0, 0], ['sit pad', 1, 0, 0]]],
    ['add my new headlamp to my gear library', [['headlamp', 1, 0, 0]]],
    ['add 2 tent stakes, a stove', [['tent stakes', 2, 0, 0], ['stove', 1, 0, 0]]],
    // Punctuation and spacing people actually type.
    ['添加装备：头灯；水袋，登山鞋。', [['头灯', 1, 0, 0], ['水袋', 1, 0, 0], ['登山鞋', 1, 0, 0]]],
    ['添加装备: headlamp, water bladder, trekking poles', [['headlamp', 1, 0, 0], ['water bladder', 1, 0, 0], ['trekking poles', 1, 0, 0]]],
    ['加一下装备 冰爪,冰镐', [['冰爪', 1, 0, 0], ['冰镐', 1, 0, 0]]],
    ['添加：头灯', [['头灯', 1, 0, 0]]],
    ['把冰镐和安全带都加到装备库', [['冰镐', 1, 0, 0], ['安全带', 1, 0, 0]]],
    ['麻烦帮我录入装备：护目镜、雪套', [['护目镜', 1, 0, 0], ['雪套', 1, 0, 0]]],
    ['新增装备：雪板、雪镜、头盔', [['雪板', 1, 0, 0], ['雪镜', 1, 0, 0], ['头盔', 1, 0, 0]]],
    ['添加装备：我的头灯', [['头灯', 1, 0, 0]]],
    // Units, multipliers and counts.
    ['添加装备：帐篷 3斤', [['帐篷', 1, 1.5, 0]]],
    ['添加装备：冲锋衣 299.5元', [['冲锋衣', 1, 0, 299.5]]],
    ['加入装备库：Nitecore NU25 头灯 45g', [['Nitecore NU25 头灯', 1, 0.045, 0]]],
    ['添加装备：炉头×2、钛锅×1', [['炉头', 2, 0, 0], ['钛锅', 1, 0, 0]]],
    ['添加装备：登山扣 x12', [['登山扣', 12, 0, 0]]],
    ['添加装备：二十个登山扣', [['登山扣', 20, 0, 0]]],
    ['添加一顶帐篷和两个睡袋', [['帐篷', 1, 0, 0], ['睡袋', 2, 0, 0]]],
    ['添加一个帐篷', [['帐篷', 1, 0, 0]]],
    ['再加一个黑钻头灯', [['黑钻头灯', 1, 0, 0]]],
    ['log a headlamp, a bear canister to my inventory', [['headlamp', 1, 0, 0], ['bear canister', 1, 0, 0]]],
    ['add headlamp', [['headlamp', 1, 0, 0]]],
  ];
  for (const [message, expected] of cases) assertEquals(slots(message), expected, message);
});

Deno.test('gear fast path abstains whenever the request is more than recording items', () => {
  const cases: Array<[string, string, Partial<GearFastPathInput>?]> = [
    ['我的装备里有头灯吗？', 'question'],
    ['冬天爬雪山需要什么装备', 'question'],
    ['推荐几个头灯', 'advice'],
    ['添加装备：我想买的冲锋衣', 'not_owned'],
    ['不要添加头灯', 'negation'],
    ['给周末露营清单加上帐篷和睡袋', 'other_target'],
    ['加个头灯到这次行程', 'other_target'],
    ['把头灯改成黑钻的', 'other_operation'],
    ['删掉头灯', 'other_operation'],
    ['那个帐篷给我记上', 'reference'],
    ['添加装备：头灯之类的', 'vague'],
    ['添加装备 https://item.jd.com/1.html', 'link'],
    ['录入装备：羽绒睡袋，舒适温度零下10度', 'unparsed_item'],
    ['添加装备：', 'no_trigger'],
    ['加油', 'no_trigger'],
    ['添加装备：速干毛巾3块', 'unparsed_item'],
    ['添加装备：头灯150块', 'unparsed_item'],
    ['增加难度', 'no_gear_signal'],
    ['增加一天', 'unparsed_item'],
    ['add a day', 'no_gear_signal'],
    ['添加凯乐石和喜马拉雅两件冲锋衣', 'no_gear_signal'],
    ['添加头灯', 'journey_open', { journeyId: 'journey-1' }],
    ['添加头灯', 'app_intent', { appIntent: 'packing_full' }],
    ['添加头灯', 'attachments', { hasAttachments: true }],
    ['添加头灯', 'pending_question', { pendingQuestion: true }],
    // Things added in other apps; a count or 装备 does not make them gear.
    ['添加一个 Python 函数', 'not_gear'],
    ['添加装备：Python 函数', 'not_gear'],
    ['添加两个好友', 'not_gear'],
    ['添加一个药品提醒', 'not_gear'],
    ['加一个闹钟', 'not_gear'],
    ['新增一条备注', 'not_gear'],
    ['增加一个群成员', 'not_gear'],
    ['add 2 users', 'not_gear'],
    ['add a friend', 'not_gear'],
    ['add a reminder', 'not_gear'],
    ['添加一张信用卡', 'no_gear_signal'],
    ['添加一个景点', 'no_gear_signal'],
    ['加一个人', 'no_gear_signal'],
    ['增加预算', 'no_gear_signal'],
    // Real gear the lexicon does not know waits for the model rather than guessing.
    ['加两个Nalgene', 'no_gear_signal'],
    ['add 3 carabiners', 'no_gear_signal'],
    // Abstentions the live suite also exercises on the model path.
    ['不用添加头灯了', 'negation'],
    ['把装备库里的头灯删掉', 'other_operation'],
    ['把头灯的重量改成 80g', 'other_operation'],
    ['add tent to my weekend camping list', 'other_target'],
    ['我刚才加了哪些装备？', 'question'],
    ['添加装备 速干衣 速干裤', 'unparsed_item'],
    ['头灯；水袋，登山鞋。', 'no_trigger'],
    ['加头灯', 'no_trigger'],
    [`添加装备：${Array.from({ length: 21 }, (_, i) => `头灯${i}号`).join('、')}`, 'unparsed_item'],
  ];
  for (const [message, reason, extra] of cases) {
    const result = parse(message, extra);
    assertEquals(result.match ? 'match' : result.reason, reason, message);
  }
});

// Precision guard: every labelled routing case that the rules claim must be a
// library add. A new case labelled anything else that starts matching here is
// a fast-path bug, because the fast path writes without asking the model.
Deno.test('gear fast path never claims a labelled request of another intent', () => {
  for (const testCase of intentCases) {
    const result = parseGearAdd(input(testCase.message, {
      journeyId: testCase.context?.journey ? 'journey-1' : null,
      appIntent: testCase.context?.appIntent ?? null,
      pendingQuestion: Boolean(testCase.context?.previous),
    }), categories);
    if (result.match) assertEquals(testCase.expect.intent, 'gear_add', `${testCase.id}: ${testCase.message}`);
  }
});

Deno.test('gear fast path authorizes with the user message itself', () => {
  const result = parse('  添加装备：头灯  ');
  assertEquals(result.match && result.authorizationQuote, '添加装备：头灯');
});

Deno.test('gear categories follow the default names, then renamed ones, else none', () => {
  assertEquals(gearCategoryFor('羽绒睡袋', categories), 'c-sleep');
  assertEquals(gearCategoryFor('始祖鸟冲锋衣', categories), 'c-wear');
  assertEquals(gearCategoryFor('Garmin inReach', categories), 'c-nav');
  assertEquals(gearCategoryFor('MSR Hubba 帐篷', categories), 'c-shelter');
  assertEquals(gearCategoryFor('登山杖', categories), null);
  assertEquals(gearCategoryFor('羽绒睡袋', [{ id: 'mine', name: '睡眠' }]), 'mine');
  assertEquals(gearCategoryFor('羽绒睡袋', [{ id: 'other', name: '其他' }]), null);
});

Deno.test('gear fast path replies name what was added, skipped and failed', () => {
  assertEquals(gearFastPathReply(['头灯', '水袋'], [], []), '已添加到装备库：头灯、水袋。');
  assertEquals(gearFastPathReply(['冰爪'], ['黑钻头灯'], []), '已添加到装备库：冰爪。\n黑钻头灯已在装备库中，没有重复添加。');
  assertEquals(gearFastPathReply([], ['帐篷'], ['水袋']), '帐篷已在装备库中，没有重复添加。\n水袋没有添加成功，请再试一次。');
  assertEquals(gearFastPathReply(['stove'], ['tent'], [], 'en'), 'Added to your gear library: stove.\nAlready in your library, not added again: tent.');
});
