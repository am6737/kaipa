import { createClient } from '@supabase/supabase-js';

const coverageModuleUrl = new URL('../supabase/functions/app-agent/packing-coverage.ts', import.meta.url).href;
const validationModuleUrl = new URL('../supabase/functions/app-agent/packing-validation.ts', import.meta.url).href;
const { missingPackingCoverage } = await import(coverageModuleUrl);
const { validatePackingItems } = await import(validationModuleUrl);

const redundantDetails = [
  /头灯（[^）]*(?:可调节?亮度|亮度可调)[^）]*）/,
  /头灯电池（[^）]*(?:匹配|适配)头灯型号[^）]*）/,
  /遮阳帽（[^）]*带帽檐[^）]*）/,
  /太阳镜（[^）]*(?:防|抗)紫外线[^）]*）/,
  /碘伏棉棒（[^）]*独立包装[^）]*）/,
  /创可贴（[^）]*(?:大|中|小)号[^）]*）/,
];

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');

const cases = [
  {
    id: 'day-trip-no-refill',
    name: '一日徒步无补给',
    days: 1,
    prompt: '请为这个单人一日徒步旅程生成完整装备清单，不增加行程。预计徒步 8 小时，天气温暖，沿途没有任何补水点，不开火且当天返回。',
    profile: { accommodation: 'day_trip', waterRefill: 'none', mealPreparation: 'no_cook' },
    expectMixedWater: true,
    expected: [/(矿泉水|瓶装水|纯净水|饮用水)/, /(能量棒|牛肉干|坚果|三明治)/, /(充电宝|移动电源)/],
  },
  {
    id: 'cold-camping-natural-water',
    name: '低温露营天然水源',
    days: 3,
    prompt: '请为这个单人三天两夜低温徒步生成完整装备清单，不增加行程。全程帐篷露营，从天然溪流取水并自行净化，使用炉头和气罐做饭，夜间低温。',
    profile: { accommodation: 'camping', waterRefill: 'natural', mealPreparation: 'cook', conditions: ['cold'] },
    expected: [/净水/, /帐篷/, /睡袋/, /(睡垫|防潮垫)/, /(炉头|炉具)/, /气罐/, /(抓绒|羽绒|保暖)/],
  },
  {
    id: 'indoor-treated-water',
    name: '室内住宿可靠补水',
    days: 2,
    prompt: '请为这个单人两日轻装徒步生成完整装备清单，不增加行程。住酒店，不露营也不开火，住宿点提供全部正餐，沿途有可靠的处理饮用水补给点，天气温暖。',
    profile: { accommodation: 'indoors', waterRefill: 'treated', mealPreparation: 'provided' },
    expected: [/(水壶|水瓶|水袋|矿泉水|瓶装水)/, /(头灯|手电)/, /(急救毯|保温毯|救生哨|求生哨)/],
  },
  {
    id: 'incremental-cable',
    name: '增量添加充电线',
    days: 1,
    prompt: '只在当前装备清单中增加一根 1 米长的 USB-C to USB-C 充电线，不要增加其他装备，也不要增加行程。',
    mode: 'incremental',
    expected: [/USB-C.*充电线|充电线.*USB-C/],
  },
];

function sameProfile(actual, expected) {
  return Object.entries(expected).every(([key, value]) => Array.isArray(value)
    ? value.every((item) => Array.isArray(actual?.[key]) && actual[key].includes(item))
    : actual?.[key] === value);
}

function capacityLiters(item) {
  if (!/(矿泉水|瓶装水|纯净水|饮用水)/.test(item.name)) return undefined;
  const text = (item.attrs || []).map((entry) => Array.isArray(entry) ? entry.join(' ') : '').join(' ');
  const match = text.match(/(\d+(?:\.\d+)?)\s*(ml|毫升|l|升)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return /^(?:ml|毫升)$/i.test(match[2]) ? value / 1000 : value;
}

async function functionError(error) {
  const response = error?.context;
  if (response?.clone) {
    try {
      const body = await response.clone().json();
      return new Error(body?.error?.message || JSON.stringify(body));
    } catch {
      // Fall back to the SDK error below.
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function createGuestClient() {
  const bootstrap = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 32);
  const anonymous = await bootstrap.auth.signInAnonymously({
    options: { data: { guest_email: `${suffix}@guest.kaipa.app`, nickname: '规划评测用户', display_name: '规划评测用户' } },
  });
  if (anonymous.error) throw anonymous.error;
  const upgraded = await bootstrap.functions.invoke('create-guest-account', { body: {} });
  if (upgraded.error || !upgraded.data?.session) throw upgraded.error || new Error('Guest upgrade failed');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await client.auth.setSession(upgraded.data.session);
  if (session.error || !session.data.user) throw session.error || new Error('Guest session unavailable');
  return { client, userId: session.data.user.id };
}

async function evaluateCase(client, userId, scenario) {
  const journeyId = `j_packing_eval_${scenario.id}_${Date.now()}`;
  const insertedJourney = await client.from('journeys').insert({
    id: journeyId,
    user_id: userId,
    name: `清单评测：${scenario.name}`,
    region: '杭州西湖群山',
    coord: '120.13,30.24',
    lng: 120.13,
    lat: 30.24,
    tone: 'forest',
    date: '2026-09-10',
    planned_date: '2026-09-10',
    days: `${scenario.days} 天`,
    total_days: scenario.days,
  });
  if (insertedJourney.error) throw insertedJourney.error;
  const insertedCompanion = await client.from('companions').insert({
    journey_id: journeyId,
    user_id: userId,
    ini: '测',
    name: '规划评测用户',
    color: '#4F8EF7',
    is_host: true,
    is_self: true,
    sort_order: 0,
  });
  if (insertedCompanion.error) throw insertedCompanion.error;

  const startedAt = Date.now();
  const turn = await client.functions.invoke('app-agent', { body: {
    action: 'turn',
    currentJourneyId: journeyId,
    locale: 'zh',
    clientLocalDate: '2026-09-04',
    clientLocalTime: '12:00',
    clientTimeZone: 'Asia/Shanghai',
    message: scenario.prompt,
  } });
  if (turn.error) throw await functionError(turn.error);
  if (turn.data?.status !== 'completed') throw new Error(`Unexpected status ${turn.data?.status}`);

  const [lists, activity, timeline] = await Promise.all([
    client.from('journey_packing_lists').select('id').eq('journey_id', journeyId),
    client.functions.invoke('app-agent', { body: { action: 'run_activity', runId: turn.data.runId } }),
    client.from('timeline_rows').select('id').eq('journey_id', journeyId),
  ]);
  if (lists.error || !lists.data?.length) throw lists.error || new Error('No packing list created');
  if (activity.error) throw activity.error;
  if (timeline.error) throw timeline.error;
  if (timeline.data.length) throw new Error('Packing-only evaluation unexpectedly created itinerary items');

  const rows = await client.from('journey_packing_items').select('name,category_name,quantity,weight_kg,weight_estimated,attrs,note').in('list_id', lists.data.map((list) => list.id)).order('sort_order');
  if (rows.error || !rows.data?.length) throw rows.error || new Error('No packing items created');
  const calls = (activity.data?.activities || []).filter((entry) => entry.toolName === 'add_packing_items');
  const completed = calls.find((entry) => entry.status === 'completed');
  if (!completed) throw new Error('No completed add_packing_items call');
  const expectedMode = scenario.mode || 'full';
  if (completed.arguments?.mode !== expectedMode) throw new Error(`Expected ${expectedMode} mode, got ${completed.arguments?.mode}`);
  if (expectedMode === 'full' && !sameProfile(completed.arguments?.planProfile, scenario.profile)) {
    throw new Error(`Unexpected plan profile: ${JSON.stringify(completed.arguments?.planProfile)}`);
  }
  const argumentItems = completed.arguments?.items || [];
  const missingWeightArguments = argumentItems
    .filter((item) => !(typeof item.weightKg === 'number' && item.weightKg > 0 && typeof item.weightEstimated === 'boolean'))
    .map((item) => item.name);

  const itemDrafts = rows.data.map((item) => ({
    name: item.name,
    categoryName: item.category_name,
    quantity: item.quantity,
    attributes: Array.isArray(item.attrs) ? item.attrs.map(([name, value]) => ({ name, value })) : undefined,
  }));
  const itemIssues = validatePackingItems(itemDrafts);
  const coverageGaps = expectedMode === 'full' ? missingPackingCoverage(itemDrafts, completed.arguments.planProfile) : [];
  const names = rows.data.map((item) => item.name);
  const missingStoredWeights = rows.data.filter((item) => !(typeof item.weight_kg === 'number' && item.weight_kg > 0)).map((item) => item.name);
  const missingWeightEstimateFlags = rows.data.filter((item) => typeof item.weight_estimated !== 'boolean').map((item) => item.name);
  const unnecessaryDetails = names.filter((name) => redundantDetails.some((pattern) => pattern.test(name)));
  const misplacedEstimateNotes = rows.data.filter((item) => /重量为估算值/.test(item.note || '')).map((item) => item.name);
  const generatedNotes = rows.data.filter((item) => Boolean(item.note?.trim())).map((item) => item.name);
  const missingExpected = scenario.expected.filter((pattern) => !names.some((name) => pattern.test(name))).map(String);
  const waterVariants = rows.data.map((item) => ({ item, liters: capacityLiters(item) })).filter((entry) => entry.liters != null);
  const mixedWaterError = scenario.expectMixedWater && !(
    waterVariants.some((entry) => entry.liters >= 1.2 && entry.liters <= 2)
    && waterVariants.some((entry) => entry.liters >= 0.45 && entry.liters <= 0.75)
    && waterVariants.reduce((total, entry) => total + entry.liters * entry.item.quantity, 0) >= 2
  ) ? waterVariants.map((entry) => ({ name: entry.item.name, liters: entry.liters, quantity: entry.item.quantity })) : undefined;
  if (itemIssues.length || coverageGaps.length || missingExpected.length || missingWeightArguments.length || missingStoredWeights.length || missingWeightEstimateFlags.length || unnecessaryDetails.length || misplacedEstimateNotes.length || generatedNotes.length || mixedWaterError) {
    throw new Error(JSON.stringify({ itemIssues, coverageGaps, missingExpected, missingWeightArguments, missingStoredWeights, missingWeightEstimateFlags, unnecessaryDetails, misplacedEstimateNotes, generatedNotes, mixedWaterError, names }));
  }

  return {
    id: scenario.id,
    passed: true,
    durationMs: Date.now() - startedAt,
    itemCount: rows.data.length,
    attributeItemCount: rows.data.filter((item) => Array.isArray(item.attrs) && item.attrs.length > 0).length,
    estimatedWeightCount: rows.data.filter((item) => item.weight_estimated === true).length,
    notedItemCount: rows.data.filter((item) => Boolean(item.note?.trim())).length,
    attempts: calls.length,
    failedAttempts: calls.filter((entry) => entry.status === 'failed').length,
  };
}

const selected = process.env.EVAL_CASES
  ? cases.filter((scenario) => process.env.EVAL_CASES.split(',').includes(scenario.id))
  : cases;
if (!selected.length) throw new Error('EVAL_CASES did not match any evaluation case');

let client;
let exitCode = 0;
const results = [];
try {
  const guest = await createGuestClient();
  client = guest.client;
  for (const scenario of selected) {
    try {
      results.push(await evaluateCase(client, guest.userId, scenario));
    } catch (error) {
      exitCode = 1;
      results.push({ id: scenario.id, passed: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
} finally {
  if (client) {
    const deleted = await client.functions.invoke('delete-account', { body: {} });
    if (deleted.error || deleted.data?.deleted !== true) {
      exitCode = 1;
      results.push({ id: 'cleanup', passed: false, error: deleted.error?.message || 'Temporary account was not deleted' });
    }
  }
}

console.log(JSON.stringify({
  passed: results.every((result) => result.passed),
  cases: results,
}, null, 2));
process.exitCode = exitCode;
