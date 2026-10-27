import { assertEquals } from 'jsr:@std/assert@1';
import { loadSmartPlanJourney, smartPlanMessage, type SmartPlanJourney } from './smart-plan.ts';

const journey = (extra: Partial<SmartPlanJourney> = {}): SmartPlanJourney => ({ id: 'j', name: '党岭三湖连穿', plannedDate: '2026-10-16', days: 7,
  track: { fileName: '党岭三湖连穿.kml', distM: 19500, ascM: 1614 }, hasBoundTrack: true, ...extra });

function rowClient(row: unknown) {
  return { from() {
    const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ error: null, data: row }) };
    return chain;
  } };
}

Deno.test('the smart plan request is written from the journey facts', () => {
  const zh = smartPlanMessage(journey());
  assertEquals(zh.startsWith('请为旅程“党岭三湖连穿”做规划。日期：10月16日 - 10月22日，共 7 天。轨迹：党岭三湖连穿.kml 19.5 km +1614 m。'), true, zh);
  assertEquals(smartPlanMessage(journey({ days: 1, plannedDate: '2026-10-31' })).includes('日期：10月31日，共 1 天。'), true);
  const undecided = smartPlanMessage(journey({ plannedDate: null, days: null, track: null, hasBoundTrack: false }));
  assertEquals(undecided.includes('日期：未设置日期，全程天数待定，请结合往返交通、接驳和徒步给出建议总天数'), true, undecided);
  assertEquals(undecided.includes('轨迹：未上传轨迹。'), true);
  // The month boundary is computed, not guessed.
  assertEquals(smartPlanMessage(journey({ plannedDate: '2026-10-30', days: 3 })).includes('10月30日 - 11月1日'), true);
  assertEquals(smartPlanMessage(journey(), 'en').startsWith('Plan “党岭三湖连穿”. Dates: Oct 16 - Oct 22, 7 days total'), true);
});

Deno.test('the journey row is read defensively', async () => {
  assertEquals(await loadSmartPlanJourney(rowClient(null), 'j'), null);
  assertEquals(await loadSmartPlanJourney(rowClient({ id: 'j', name: '  ' }), 'j'), null);
  assertEquals(await loadSmartPlanJourney(rowClient({ id: 'j', name: '哈天线', planned_date: '2026-10-10', total_days: 5, track_id: 't',
    tracks: [{ file_name: 'hatian.gpx', dist_m: 52000, asc_m: 3100, coords: [[1, 2], [3, 4]] }] }), 'j'),
    { id: 'j', name: '哈天线', plannedDate: '2026-10-10', days: 5, track: { fileName: 'hatian.gpx', distM: 52000, ascM: 3100 }, hasBoundTrack: true });
  // Unusable dates and durations become undecided rather than wrong facts.
  assertEquals(await loadSmartPlanJourney(rowClient({ id: 'j', name: '哈天线', planned_date: '10月10日', total_days: 45, track_id: null, tracks: null }), 'j'),
    { id: 'j', name: '哈天线', plannedDate: null, days: null, track: null, hasBoundTrack: false });
});
