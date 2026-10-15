import { ruralLocationProvince, journeyProvince, geocodeKeywordLadder } from './itinerary-geocoding.ts';

Deno.test('ambiguous hiking villages use destination province, transport hubs do not', () => {
  const region = '四川省甘孜藏族自治州丹巴县';
  if (ruralLocationProvince('卡尔杂村', region) !== '四川省') throw new Error('village must be scoped to Sichuan');
  for (const name of ['南宁东', '成都东', '西藏自治区日喀则市拉孜县卡尔杂村']) {
    if (ruralLocationProvince(name, region) !== undefined) throw new Error(`explicit location was overridden: ${name}`);
  }
  if (ruralLocationProvince('卡尔杂村', '') !== undefined) throw new Error('must not invent a province');
});

// Journey regions are written by the model as shorthand ("四川甘孜·党岭"), so a
// bare province name has to expand before the map provider can scope the search;
// without it a village name is matched against namesakes in another province.
Deno.test('shorthand regions still scope a rural search', () => {
  for (const [region, province] of [
    ['四川甘孜·党岭', '四川省'],
    ['西藏', '西藏自治区'],
    ['重庆武隆', '重庆市'],
    ['香港', '香港特别行政区'],
  ] as const) {
    if (ruralLocationProvince('卡尔杂村', region) !== province) throw new Error(`${region} must scope to ${province}`);
  }
  if (journeyProvince('成都') !== undefined) throw new Error('a city region must not invent a province');
  if (journeyProvince(null) !== undefined) throw new Error('a missing region must not invent a province');
});

Deno.test('the provider keyword ladder keeps the full name first', () => {
  if (JSON.stringify(geocodeKeywordLadder('卡尔杂村')) !== JSON.stringify(['卡尔杂村', '卡尔杂'])) throw new Error('village stem must follow the full name');
  if (JSON.stringify(geocodeKeywordLadder(' 甲依拉措 ')) !== JSON.stringify(['甲依拉措'])) throw new Error('a plain place name must stay single');
  if (JSON.stringify(geocodeKeywordLadder('张村')) !== JSON.stringify(['张村'])) throw new Error('a stem shorter than two characters is not searchable');
});
