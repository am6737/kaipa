const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(path, imports = {}) {
  const context = { exports: {}, require: (name) => imports[name], setTimeout, clearTimeout };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const shared = load('supabase/functions/app-agent/location.ts');
function harness(overrides = {}) {
  const calls = [];
  const location = {
    Accuracy: { Balanced: 3 },
    getForegroundPermissionsAsync: async () => { calls.push('check'); return { granted: true }; },
    requestForegroundPermissionsAsync: async () => { calls.push('request'); return { granted: true }; },
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => { calls.push('locate'); return { coords: { latitude: 25, longitude: 110, accuracy: 30 }, timestamp: Date.now() }; },
    ...overrides,
  };
  return { calls, ...load('src/lib/agentLocation.ts', { 'expo-location': location, '../../supabase/functions/app-agent/location': shared }) };
}

test('only explicit current-location messages trigger collection', async () => {
  const h = harness();
  for (const message of ['从当前位置出发', '从我这里出发', '用我的位置', 'Start from here', 'Use my current location']) {
    assert.equal(h.requestsCurrentLocation(message), true);
  }
  for (const message of ['帮我补交通', '从上海出发', '不要使用当前位置', "Don't use my location"]) {
    assert.equal(await h.getAgentLocation(message), undefined);
  }
  assert.equal(h.calls.length, 0);
});
test('authorized fix includes coordinates, accuracy, time and coordinate system', async () => {
  const h = harness();
  const result = await h.getAgentLocation('从当前位置出发');
  assert.equal(result.status, 'available');
  assert.equal(result.latitude, 25);
  assert.equal(result.longitude, 110);
  assert.equal(result.accuracy, 30);
  assert.equal(result.coordinateSystem, 'WGS84');
  assert.ok(result.timestamp > Date.now() - 1000);
  assert.deepEqual(h.calls, ['check', 'locate']);
});
test('schedule follow-up requesting this fix collects a fresh device location', async () => {
  const h = harness();
  const message = '请将旅程改为 2026-09-08 至 2026-09-09，共 2 天：Day 1 从本次定位出发，Day 2 保留原徒步行程并在结束后公共交通返回本次定位；无法核验的班次请标注。';
  assert.equal((await h.getAgentLocation(message)).status, 'available');
  assert.deepEqual(h.calls, ['check', 'locate']);
  for (const wording of ['从这次定位出发', '返回本次的定位', '使用设备位置', '从手机的当前位置出发']) {
    assert.equal(h.requestsCurrentLocation(wording), true, wording);
  }
});
test('new location wording still respects explicit refusal and historical references', async () => {
  const h = harness();
  for (const message of ['不要使用本次定位', '不用这次定位', '别获取手机位置', '无需设备定位', '从上次定位出发', '使用上一轮坐标']) {
    assert.equal(await h.getAgentLocation(message), undefined, message);
  }
  assert.deepEqual(h.calls, []);
});
test('requests permission only when allowed', async () => {
  const h = harness({ getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }) });
  assert.equal((await h.getAgentLocation('当前位置')).status, 'available');
  assert.deepEqual(h.calls, ['request', 'locate']);
  const denied = harness({ getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false }) });
  assert.equal((await denied.getAgentLocation('当前位置')).status, 'permission_denied');
  assert.equal(denied.calls.length, 0);
  const rejected = harness({ getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }), requestForegroundPermissionsAsync: async () => ({ granted: false }) });
  assert.equal((await rejected.getAgentLocation('当前位置')).status, 'permission_denied');
});
test('disabled services, errors and stalled fixes do not block sending', async () => {
  assert.equal((await harness({ hasServicesEnabledAsync: async () => false }).getAgentLocation('当前位置')).status, 'services_disabled');
  assert.equal((await harness({ getCurrentPositionAsync: async () => { throw new Error('GPS'); } }).getAgentLocation('当前位置')).status, 'unavailable');
  assert.equal((await harness({ getCurrentPositionAsync: () => new Promise(() => {}) }).getAgentLocation('当前位置', 5)).status, 'timeout');
});
test('server validates and strips location payloads, including old queued fixes', () => {
  const fix = { status: 'available', latitude: 25, longitude: 110, accuracy: null, timestamp: Date.now(), coordinateSystem: 'WGS84', extra: 'untrusted' };
  assert.equal(shared.normalizeAgentLocation(fix).extra, undefined);
  assert.equal(shared.normalizeAgentLocation(fix, fix.timestamp + 300001).status, 'stale');
  for (const change of [{ latitude: 91 }, { longitude: Infinity }, { accuracy: -1 }, { timestamp: 'today' }, { coordinateSystem: 'GCJ02' }]) {
    assert.equal(shared.normalizeAgentLocation({ ...fix, ...change }).status, 'unavailable');
  }
  assert.equal(shared.normalizeAgentLocation(undefined), undefined);
});
test('location is carried through request, queue, runtime and context tool', () => {
  const ui = fs.readFileSync('src/components/assistant/AppAssistant.tsx', 'utf8');
  const server = fs.readFileSync('supabase/functions/app-agent/index.ts', 'utf8');
  assert.match(ui, /await getAgentLocation\(visibleMessage, 15_000, locationIntent\)/);
  assert.match(ui, /attachments, currentLocation, \.\.\.localAgentTimeContext/);
  assert.equal((server.match(/currentLocation: normalizeAgentLocation\(body.currentLocation\)/g) || []).length, 2);
  assert.match(server, /JSON.stringify\(context.currentLocation\)/);
  assert.match(fs.readFileSync('supabase/functions/app-agent/tools.ts', 'utf8'), /currentLocation: context.currentLocation/);
});

test('transport entry uses authorized location without prompting and is independent of wording', async () => {
  const h = harness();
  assert.equal(h.transportLocationIntent({ action: 'supplement_plan', label: '安排往返交通' }), 'transport');
  assert.equal(h.transportLocationIntent({ action: 'supplement_plan', label: 'Arrange transport' }), 'transport');
  assert.equal(h.transportLocationIntent({ action: 'supplement_plan', label: '安排住宿' }), undefined);
  assert.equal(h.transportLocationIntent({ action: 'request_location', label: 'Use location' }), 'request_location');
  assert.equal((await h.getAgentLocation('补交通', 100, 'transport')).status, 'available');
  assert.deepEqual(h.calls, ['check', 'locate']);
  const fresh = harness({ getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }) });
  assert.equal((await fresh.getAgentLocation('补交通', 100, 'transport')).status, 'permission_required');
  assert.deepEqual(fresh.calls, []);
  assert.equal((await fresh.getAgentLocation('Use this place', 100, 'request_location')).status, 'available');
  assert.deepEqual(fresh.calls, ['request', 'locate']);
});

test('transport intent respects refusal; geocoding only includes region/city/district', async () => {
  const h = harness({ reverseGeocodeAsync: async () => [{ region: '广西', city: '桂林', district: '阳朔', street: 'private street', name: 'private house' }] });
  assert.equal(await h.getAgentLocation('不要定位', 100, 'transport'), undefined);
  assert.deepEqual(h.calls, []);
  const fix = await h.getAgentLocation('补交通', 100, 'transport');
  assert.equal(fix.placeName, '广西 桂林 阳朔');
  assert.equal(shared.normalizeAgentLocation(fix).placeName, fix.placeName);
  assert.equal(JSON.stringify(fix).includes('private'), false);
});

test('reverse geocoding failure retains the valid fix', async () => {
  const h = harness({ reverseGeocodeAsync: async () => { throw new Error('unsupported'); } });
  assert.equal((await h.getAgentLocation('当前位置')).status, 'available');
});

test('confirmed origin and refusal survive history restoration without resampling', () => {
  const h = harness();
  const travel = JSON.parse(JSON.stringify({ journeyId: 'j', origin: 'Hangzhou', returnDestination: 'Shanghai', locationDeclined: false }));
  assert.equal(h.shouldSuggestTransportLocation(travel, 'j'), false);
  assert.equal(h.shouldSuggestTransportLocation({ ...travel, origin: null, locationDeclined: true }, 'j'), false);
  assert.equal(h.shouldSuggestTransportLocation(travel, 'other'), true);
  assert.equal(h.shouldSuggestTransportLocation(null, 'j'), true);
  assert.equal(h.shouldSuggestTransportLocation({ ...travel, origin: null }, 'j'), true);
});
