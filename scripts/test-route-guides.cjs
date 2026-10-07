const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; new Function('exports', 'require', 'module', code)(module.exports, require, module); return module.exports;
}
const { getRouteGuidePlans, getRouteDemoGuides, sortRouteGuides, toRouteGuideTemplate } = load('src/data/routeGuides.ts');
const { parseRouteWeather, routeWeatherUrl, weatherDescription } = load('src/lib/routeWeather.ts');
const route = { id: 'route-a', name: 'A route' };
test('reference scaffolds carry the selected route and distinguish lodging from camping equipment', () => {
  const plans = getRouteGuidePlans(route);
  assert.deepEqual(plans.map(p => p.days.length), [1, 2, 3]);
  assert(plans.every(p => p.routeId === route.id && p.draft));
  assert(!plans[1].gear.some(g => g.name.zh === '帐篷'));
  assert(plans[2].gear.some(g => g.name.zh === '帐篷'));
  assert(plans.every(p => p.days[0].items.some(i => i.zh.includes('起点接驳')) && p.days.at(-1).items.some(i => i.zh.includes('返程'))));
});
test('creating a journey copies itinerary and categorized equipment without mutating reference content', () => {
  const plan = getRouteGuidePlans(route)[2], before = structuredClone(plan);
  const template = toRouteGuideTemplate(plan, 'zh');
  assert.equal(template.routeId, route.id); assert.equal(template.days.length, 3);
  assert.equal(template.gear.length, plan.gear.length);
  assert(template.gear.every(g => g.categoryName && g.note && g.quantity > 0));
  template.days[0].items[0] = 'My transport'; template.gear[0].name = 'My tent';
  assert.deepEqual(plan, before);
  assert.equal(toRouteGuideTemplate(plan, 'en').gear[0].name, 'Tent');
});
test('guide helpful and update ordering are different; filters preserve input', () => {
  const guides = getRouteDemoGuides(getRouteGuidePlans(route)), before = structuredClone(guides);
  assert(guides.every(g => g.demo && g.plan.days.length && g.plan.gear.length));
  assert.equal(sortRouteGuides(guides, 'helpful')[0].id, 'demo-camp-spring');
  assert.equal(sortRouteGuides(guides, 'updated')[0].id, 'demo-stay-autumn');
  assert(sortRouteGuides(guides, 'recommended', 'stay').every(g => g.plan.stay === 'stay'));
  assert.equal(sortRouteGuides(guides, 'helpful', 'day').length, 0);
  assert.deepEqual(guides, before);
});
test('weather payload retains valid days and distinguishes missing precipitation from zero', () => {
  const result = parseRouteWeather({ daily: { time: ['2026-10-07', '2026-10-08', 'bad'], temperature_2m_min: [8, 7, 0], temperature_2m_max: [16, 15, 20], weather_code: [3, 0, 0], precipitation_probability_max: [0, null, 0], wind_speed_10m_max: [12, -5, 10] } }, '2026-10-07T00:00:00Z');
  assert.equal(result.days.length, 2); assert.equal(result.days[0].rain, 0);
  assert.equal(result.days[1].rain, null); assert.equal(result.days[1].wind, null);
  assert.equal(result.fetchedAt, '2026-10-07T00:00:00Z');
  assert.throws(() => parseRouteWeather({})); assert.throws(() => parseRouteWeather({ daily: { time: ['2026-10-07'], temperature_2m_min: [null], temperature_2m_max: [20], weather_code: [3] } }));
});
test('weather positions reject invalid coordinates; unknown WMO codes are not thunderstorms', () => {
  assert.throws(() => routeWeatherUrl(181, 25)); assert.throws(() => routeWeatherUrl(110, NaN));
  assert(routeWeatherUrl(114.17, 27.46).includes('latitude=27.46&longitude=114.17'));
  assert.equal(weatherDescription(0, 'zh'), '晴'); assert.equal(weatherDescription(95, 'en'), 'Thunderstorm');
  assert.equal(weatherDescription(123, 'zh'), '未知');
});
