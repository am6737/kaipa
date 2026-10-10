import { ruralLocationProvince } from './itinerary-geocoding.ts';

Deno.test('ambiguous hiking villages use destination province, transport hubs do not', () => {
  const region = '四川省甘孜藏族自治州丹巴县';
  if (ruralLocationProvince('卡尔杂村', region) !== '四川省') throw new Error('village must be scoped to Sichuan');
  for (const name of ['南宁东', '成都东', '西藏自治区日喀则市拉孜县卡尔杂村']) {
    if (ruralLocationProvince(name, region) !== undefined) throw new Error(`explicit location was overridden: ${name}`);
  }
  if (ruralLocationProvince('卡尔杂村', '') !== undefined) throw new Error('must not invent a province');
});
