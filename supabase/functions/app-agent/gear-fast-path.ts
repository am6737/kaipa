// Rule-based fast path for "add these items to my gear library".
//
// This is the classic intent + slot-filling front end (the pattern Home
// Assistant's hassil and car/phone assistants use): a small declarative grammar
// recognizes one narrow intent with high precision, and everything else falls
// through to the model pipeline unchanged. Two rules keep it safe:
//
// - Abstain on doubt. The parser returns a reason instead of a guess whenever a
//   message is a question, mentions another target (trip checklist, gear set),
//   negates, refers back to earlier context, or leaves any item unparsed.
// - One execution path. A match only produces the task decision; the items are
//   still written through the add_gear tool, so authorization, dedupe, the tool
//   call audit, undo and the outcome check are the ones the model path uses.
//
// The grammar is data below. Extend it there, add the phrasing to
// gear-fast-path_test.ts, and keep the precision guard over intent-cases.ts green.

export type GearCategory = { id: string; name: string };
export type ParsedGearItem = {
  name: string;
  quantity: number;
  weightKg: number;
  priceCny: number;
  categoryId: string | null;
};
export type GearFastPathInput = {
  message: string;
  journeyId: string | null;
  appIntent: string | null;
  hasAttachments: boolean;
  pendingQuestion: boolean;
};
export type GearFastPathResult =
  | { match: true; items: ParsedGearItem[]; authorizationQuote: string }
  | { match: false; reason: string };

const MAX_MESSAGE_LENGTH = 400;
const MAX_ITEMS = 20;
const MAX_NAME_LENGTH = 60;

// Anything that makes the request more than "record these items". The model
// pipeline handles these (or asks), so matching one only means abstaining.
const abstainPatterns: Array<[reason: string, pattern: RegExp]> = [
  ['question', /[?？]|吗|呢|什么|哪|怎么|如何|是否|要不要|需不需要|有没有|能不能|可以吗|\b(what|which|how|should|do i|does|is there|any)\b/i],
  ['advice', /推荐|建议|适合|需要准备|比较|对比|选择|挑|\b(recommend|suggest|compare|need)\b/i],
  // 新买的 is owned; only gear still to be bought is not library gear.
  ['not_owned', /(?:想|要|准备|打算|计划|还没|该)买|想要|心愿|待购|\b(buy|purchase|wishlist|want)\b/i],
  ['negation', /不要|不用|不需要|不想|不必|别|没有|勿|\b(don'?t|not|no|never|without)\b/i],
  ['other_target', /清单|行程|旅程|日程|套装|组合|列表|打包|行李|\b(list|checklist|trip|journey|packing|set|kit)\b/i],
  ['other_operation', /删|去掉|移除|移走|改|换|替换|撤销|撤回|更新|编辑|\b(remove|delete|change|replace|update|edit|undo)\b/i],
  ['reference', /这个|那个|这些|那些|它|上面|刚才|之前|同样|一样|\b(it|this|that|these|those|same)\b/i],
  ['vague', /一些|几个|若干|之类|什么的|等等|\b(some|stuff|things)\b/i],
  ['link', /https?:|www\.|@/i],
  // Things people add in other apps. The topic check is skipped on this path,
  // so these must never reach the gear library through it.
  ['not_gear', /提醒|闹钟|好友|联系人|群|函数|代码|程序|文件|照片|图片|视频|文章|笔记|日记|备注|账号|密码|日程|会议|任务|\b(?:users?|friends?|contacts?|reminders?|alarms?|files?|photos?|code|function|tasks?|notes?)\b/i],
];

// "添加装备：" style prefixes. A strong verb is enough on its own; the bare
// verbs 加/再加/存 also occur in unrelated phrases (加油, 存钱), so they must be
// followed by a quantity or classifier ("加个头盔", "再加一个水壶") or name the
// gear library explicitly.
const politePrefix = '(?:请|麻烦)?(?:你)?(?:帮我|给我|替我|帮忙)?(?:把)?(?:再)?';
const strongVerb = '(?:添加|新增|增加|加上|加入|加一下|录入|记上|登记|入库|收录)';
const weakVerb = '(?:加|存)';
const verbTail = '(?:一下|下)?';
const libraryTarget = '(?:到|进|入)?(?:我的)?(?:个人)?装备库(?:里|中)?';
const objectWord = '(?:以下|下面)?(?:的)?(?:装备|物品|东西)?';
const listColon = '[:\\s]*';

const prefixPatterns: Array<{ pattern: RegExp; needsQuantity: boolean }> = [
  { pattern: new RegExp(`^${politePrefix}${strongVerb}${verbTail}(?:${libraryTarget})?${objectWord}(?:${libraryTarget})?${listColon}`), needsQuantity: false },
  { pattern: new RegExp(`^${politePrefix}${weakVerb}${verbTail}${libraryTarget}${objectWord}${listColon}`), needsQuantity: false },
  { pattern: new RegExp(`^${politePrefix}${weakVerb}${verbTail}${objectWord}${listColon}`), needsQuantity: true },
];
// "把头灯、水袋加到装备库" keeps the verb after the items, so it names the
// library to stay unambiguous.
const suffixPattern = new RegExp(`^${politePrefix}(.+?)(?:都|也)?(?:添加|加|放|存|录入|记)${libraryTarget}$`);
const englishPrefix = /^(?:please\s+)?(?:add|log|record|save)\s+/i;
const englishTarget = /\s+(?:to|into|in)\s+(?:my\s+)?(?:gear(?:\s+library)?|inventory|library)$/i;

// Items are split on list punctuation and conjunctions. NFKC has already
// folded full-width commas and semicolons to ASCII.
const itemSeparator = /[、,;\n]+|(?:以及|还有|和|及|跟|与)|\s+and\s+|\s*&\s*/i;

const classifiers = '个|件|双|副|顶|只|根|支|套|条|块|瓶|罐|盏|台|张|袋|包|对|把|盒|卷|片|颗';
const chineseDigits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const englishNumbers: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numeral = `\\d+|[一二两三四五六七八九十]+`;
const leadingQuantity = new RegExp(`^(${numeral})\\s*(?:${classifiers})\\s*`);
// 个/件 without a number mean one ("加个头盔"). Other classifiers start real
// names (双肩包, 套头衫), so they only count after a number.
const bareClassifier = /^(?:个|件)\s*/;
const trailingQuantity = new RegExp(`\\s*(${numeral})\\s*(?:${classifiers})$`);
const multiplier = /\s*[x×*]\s*(\d+)$/i;
const englishQuantity = /^(?:(\d+)|(a|an|one|two|three|four|five|six|seven|eight|nine|ten))\s+/i;
const weightToken = /(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|斤)(?![a-z])/i;
const priceToken = /(?:¥\s*(\d+(?:\.\d+)?))|(?:(\d+(?:\.\d+)?)\s*(?:元|块钱|rmb|cny)(?![a-z]))/i;
// 毛巾3块 is a count and 头灯150块 a price; the grammar cannot tell them apart.
const ambiguousKuai = /\d\s*块$/;
const weightKg: Record<string, number> = { kg: 1, 千克: 1, 公斤: 1, g: 0.001, 克: 0.001, 斤: 0.5 };

// Keywords for the default categories (gear-categories-per-user.sql). Order
// matters: 羽绒睡袋 is sleeping gear before it is clothing. A user who renamed
// a category still matches on its first two characters; no match leaves the
// item uncategorized, as the model path does.
const categoryLexicon: Array<[category: string, pattern: RegExp]> = [
  ['睡眠系统', /睡袋|睡垫|防潮垫|充气枕|枕头|内胆|sleeping\s*(?:bag|pad)/i],
  ['庇护系统', /帐篷|天幕|地布|地钉|吊床|\b(?:tent|tarp|hammock)\b/i],
  ['背负系统', /背包|腰包|胸包|驮包|防雨罩|\b(?:backpack|pack)\b/i],
  ['电子导航', /头灯|营地灯|手电|充电宝|移动电源|gps|手表|对讲机|inreach|卫星|指南针|\b(?:headlamp|lantern|flashlight|power\s*bank|compass)\b/i],
  ['饮食系统', /炉|锅|气罐|餐具|水袋|水壶|水瓶|保温杯|杯|净水|滤水|\b(?:stove|pot|bottle|filter|cup|bladder)\b/i],
  ['安全急救', /急救|药|哨子|救生毯|头盔|\b(?:first\s*aid|whistle|helmet)\b/i],
  ['服饰系统', /冲锋衣|冲锋裤|软壳|硬壳|羽绒|抓绒|速干|衣|裤|袜|鞋|靴|手套|帽|头巾|围脖|雪套|袖套|马甲|\b(?:jacket|pants|shoes?|boots?|socks?|gloves?|hat|beanie)\b/i],
];

function chineseNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  const tens = value.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (tens) return (tens[1] ? chineseDigits[tens[1]] : 1) * 10 + (tens[2] ? chineseDigits[tens[2]] : 0);
  return value.length === 1 && value in chineseDigits ? chineseDigits[value] : null;
}

export function gearCategoryFor(name: string, categories: GearCategory[]): string | null {
  const canonical = categoryLexicon.find(([, pattern]) => pattern.test(name))?.[0];
  if (!canonical) return null;
  const match = categories.find(category => category.name === canonical)
    ?? categories.find(category => category.name.includes(canonical.slice(0, 2)));
  return match?.id ?? null;
}

// An item carries its own gear signal when it names a known kind of gear.
// Messages that never say 装备/gear need that signal on every item. A count is
// not a signal: 添加两个好友 and 添加一个 Python 函数 are counted too.
type ParsedItem = ParsedGearItem & { signal: boolean };

function isKnownGear(name: string) {
  return categoryLexicon.some(([, pattern]) => pattern.test(name));
}

function parseItem(raw: string, categories: GearCategory[]): ParsedItem | null {
  let text = raw.trim().replace(/[.。!！]+$/, '').trim();
  if (ambiguousKuai.test(text)) return null;
  let quantity: number | null = null;
  let weight = 0;
  let price = 0;
  const weightMatch = text.match(weightToken);
  if (weightMatch) {
    weight = Number(weightMatch[1]) * weightKg[weightMatch[2].toLowerCase()];
    text = text.replace(weightToken, ' ');
  }
  const priceMatch = text.match(priceToken);
  if (priceMatch) {
    price = Number(priceMatch[1] ?? priceMatch[2]);
    text = text.replace(priceToken, ' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  const leading = text.match(leadingQuantity) ?? text.match(englishQuantity);
  if (leading) {
    quantity = leading[1] ? chineseNumber(leading[1]) : englishNumbers[leading[2].toLowerCase()];
    text = text.slice(leading[0].length);
  } else if (bareClassifier.test(text)) {
    quantity = 1;
    text = text.replace(bareClassifier, '');
  }
  const trailing = text.match(trailingQuantity) ?? text.match(multiplier);
  if (trailing) {
    if (quantity !== null) return null;
    quantity = chineseNumber(trailing[1]);
    text = text.slice(0, trailing.index);
  }
  const name = text.replace(/^(?:我的?)?(?:(?:新|刚)(?:买|入手)的)?/, '')
    .replace(/^(?:the\s+|my\s+)?(?:new\s+)?/i, '').replace(/\s+/g, ' ').trim();
  if (quantity === null) quantity = 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
  if (weight > 100 || price > 10_000_000) return null;
  // What is left must look like a name: no stray numbers that would be a unit
  // the grammar does not know, no leftover verbs, nothing empty or huge.
  if (!name || name.length > MAX_NAME_LENGTH || /^\d+(?:\.\d+)?$/.test(name)) return null;
  if (/[:：]|添加|加上|装备库/.test(name)) return null;
  if (/^(?:装备|物品|东西|gear|items?)$/i.test(name)) return null;
  // 速干衣 速干裤 may be two items or one name; let the model decide.
  if (/\p{Script=Han}\s+\p{Script=Han}/u.test(name)) return null;
  // Attributes, sentences and durations are not names (舒适温度零下10度,
  // 今天走了10公里, 一天); the model path can read those.
  if (/温度|重量|颜色|尺码|容量|价格|零下|舒适|℃|°|\d\s*度/.test(name)) return null;
  if (/[了是在我你他她们吧啊呀哦嗯]|今天|明天|昨天/.test(name)) return null;
  if (/\d\s*(?:天|晚|夜|小时|分钟|公里|km|米)$|^[一二两三四五六七八九十\d]+\s*(?:天|晚|夜|小时|分钟|公里|米)/i.test(name)) return null;
  return { name, quantity, weightKg: Math.round(weight * 1000) / 1000, priceCny: price,
    categoryId: gearCategoryFor(name, categories), signal: isKnownGear(name) };
}

function splitItems(list: string, categories: GearCategory[]): ParsedItem[] | null {
  const parts = list.split(itemSeparator).map(part => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > MAX_ITEMS) return null;
  const items: ParsedItem[] = [];
  for (const part of parts) {
    const item = parseItem(part, categories);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

export function parseGearAdd(input: GearFastPathInput, categories: GearCategory[]): GearFastPathResult {
  // A trip in view makes "添加头灯" ambiguous between the library and that
  // trip's checklist; the router asks which one.
  if (input.journeyId) return { match: false, reason: 'journey_open' };
  if (input.appIntent && input.appIntent !== 'gear_onboarding') return { match: false, reason: 'app_intent' };
  if (input.hasAttachments) return { match: false, reason: 'attachments' };
  if (input.pendingQuestion) return { match: false, reason: 'pending_question' };
  const message = input.message.normalize('NFKC').trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) return { match: false, reason: 'length' };
  for (const [reason, pattern] of abstainPatterns) {
    if (pattern.test(message)) return { match: false, reason };
  }
  const body = message.replace(/[.。!！]+$/, '');
  const items = triggeredItems(body, categories);
  if (!items) return { match: false, reason: 'no_trigger' };
  if (items === 'unparsed') return { match: false, reason: 'unparsed_item' };
  if (!gearWord.test(body) && !items.every(item => item.signal)) return { match: false, reason: 'no_gear_signal' };
  // The whole message is the instruction; constrainTaskDecision verifies the
  // quote against it exactly as it does for the interpreter's quote.
  return { match: true, items: items.map(({ signal: _, ...item }) => item), authorizationQuote: input.message.trim() };
}

const gearWord = /装备|\b(?:gear|inventory)\b/i;

function triggeredItems(body: string, categories: GearCategory[]): ParsedItem[] | 'unparsed' | null {
  for (const { pattern, needsQuantity } of prefixPatterns) {
    const prefix = body.match(pattern);
    if (!prefix || prefix[0].length === body.length) continue;
    const list = body.slice(prefix[0].length);
    if (needsQuantity && !leadingQuantity.test(list) && !bareClassifier.test(list)) continue;
    return splitItems(list, categories) ?? 'unparsed';
  }
  const suffix = body.match(suffixPattern);
  if (suffix) return splitItems(suffix[1], categories) ?? 'unparsed';
  const english = body.match(englishPrefix);
  if (english) {
    const list = body.slice(english[0].length).replace(englishTarget, '');
    return (list && splitItems(list, categories)) || 'unparsed';
  }
  return null;
}

// Fixed replies; there is no model to phrase them. Items the library already
// had come back from add_gear with existing=true.
export function gearFastPathReply(added: string[], existing: string[], failed: string[], locale?: 'zh' | 'en'): string {
  if (locale === 'en') {
    return [
      added.length ? `Added to your gear library: ${added.join(', ')}.` : null,
      existing.length ? `Already in your library, not added again: ${existing.join(', ')}.` : null,
      failed.length ? `Could not add: ${failed.join(', ')}. Please try again.` : null,
    ].filter(Boolean).join('\n');
  }
  return [
    added.length ? `已添加到装备库：${added.join('、')}。` : null,
    existing.length ? `${existing.join('、')}已在装备库中，没有重复添加。` : null,
    failed.length ? `${failed.join('、')}没有添加成功，请再试一次。` : null,
  ].filter(Boolean).join('\n');
}
