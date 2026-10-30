import { ruralLocationProvince, journeyProvince, geocodeKeywordLadder, matchesWaypointName } from './itinerary-geocoding.ts';

Deno.test('ambiguous hiking villages use destination province, transport hubs do not', () => {
  const region = '四川省甘孜藏族自治州丹巴县';
  if (ruralLocationProvince('卡尔杂村', region) !== '四川省') throw new Error('village must be scoped to Sichuan');
  for (const name of ['南宁东', '成都东', '新乡', '新乡东', '西藏自治区日喀则市拉孜县卡尔杂村']) {
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

Deno.test('a plan stop anchors on a decorated route waypoint by whole segment', () => {
  if (!matchesWaypointName('马武寨', '起点·马武寨')) throw new Error('start label must not hide the place');
  if (!matchesWaypointName('张沟', '张沟（第1天住宿）')) throw new Error('stay note must not hide the place');
  if (!matchesWaypointName('窟窿山', '窟窿山·天门')) throw new Error('paired names must both match');
  if (matchesWaypointName('张沟', '张沟梯')) throw new Error('a longer name is a different place');
  if (matchesWaypointName('', '张沟')) throw new Error('an empty name must not match');
});
