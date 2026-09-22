import { resolveHikingEndpoint, validateHikingBoundary, type OvernightReview } from './hiking-boundaries.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
function rejects(fn: () => unknown) { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'expected validation failure'); }

const sourceUrl = 'https://guides.example.com/hike';
const campQuote = 'We camped at Lake Camp on the first night.';
const waterQuote = 'The stream near camp was flowing in June 2024.';
const review: OvernightReview = { sourceUrl, campQuote, waterStatus: 'reported', waterQuote,
  waterPlan: 'Historical report only; carry reserve water from the confirmed trailhead and verify before departure.',
  effortAssessment: 'First day is 12 km; guide reports steep ascent. Allow eight hours including breaks; current crossing conditions remain unknown.' };
const waypoints = [{ name: 'Lake Camp', km: 12 }, { name: 'Pass', km: 14.4 }];
const receipts = [{ tool_name: 'read_travel_guide', status: 'completed', output: { available: true, url: sourceUrl, text: `${campQuote}\n${waterQuote}` } }];
const endpoint = { endDistanceKm: 12, locationName: 'Lake Camp', overnightReview: review };

Deno.test('waypoint selectors resolve exact stored names and distances without model transcription', () => {
  const points = [{ name: 'Duplicate Camp', km: 10.123456789 }, { name: 'Duplicate Camp', km: 25.987654321 }];
  for (let waypointIndex = 0; waypointIndex < points.length; waypointIndex++) {
    const resolved = resolveHikingEndpoint({ waypointIndex }, 72000, points);
    assert(resolved.endDistanceKm === points[waypointIndex].km && resolved.locationName === points[waypointIndex].name);
    assert(validateHikingBoundary(resolved, 72000, points, []).source === 'waypoint');
  }
  assert(resolveHikingEndpoint({ trackFinish: true }, 72000, []).endDistanceKm === 72);
  for (const index of [-1, 0.5, 2]) rejects(() => resolveHikingEndpoint({ waypointIndex: index }, 72000, points));
  rejects(() => resolveHikingEndpoint({ waypointIndex: 0, locationName: 'Invented' }, 72000, points));
  rejects(() => resolveHikingEndpoint({ waypointIndex: 0, endDistanceKm: 14.4 }, 72000, points));
  rejects(() => resolveHikingEndpoint({ waypointIndex: 0, trackFinish: true }, 72000, points));
  rejects(() => resolveHikingEndpoint({}, 72000, points));
  const offTrack = [{ name: 'Camp', km: 12, distanceFromTrackMeters: 200 }];
  rejects(() => validateHikingBoundary(resolveHikingEndpoint({ waypointIndex: 0 }, 72000, offTrack), 72000, offTrack, []));
});

Deno.test('rejects five-day equal splits even if estimates are labeled or labels are omitted', () => {
  for (let day = 1; day < 5; day++) {
    rejects(() => validateHikingBoundary({ endDistanceKm: 14.4 * day, estimateBasis: 'equal shares' }, 72000, waypoints, receipts));
    rejects(() => validateHikingBoundary({ endDistanceKm: 14.4 * day }, 72000, waypoints, receipts));
  }
});

Deno.test('named passes and fabricated waypoint distances cannot impersonate overnight camps', () => {
  assert(validateHikingBoundary({ endDistanceKm: 14.4, locationName: 'Pass' }, 72000, waypoints, []).locationName?.includes('扎营条件待核实'));
  rejects(() => validateHikingBoundary({ ...endpoint, endDistanceKm: 14.4 }, 72000, waypoints, receipts));
  rejects(() => validateHikingBoundary({ ...endpoint, locationName: 'Invented Camp' }, 72000, waypoints, receipts));
  assert(validateHikingBoundary(endpoint, 72000, waypoints, receipts).locationName === 'Lake Camp');
});

Deno.test('original GPX campsite saves without any guide or overnight review', () => {
  const points = [{ name: '第一天营地', km: 10.284799959644426 }];
  const stop = { locationName: points[0].name, endDistanceKm: points[0].km };
  const saved = validateHikingBoundary(stop, 80374.40696857945, points, []);
  assert(saved.source === 'waypoint' && saved.locationName === '第一天营地（候选终点，扎营条件待核实）');
  const unknown = { waterStatus: 'unknown' as const, waterQuote: '', waterPlan: review.waterPlan, effortAssessment: review.effortAssessment };
  assert(validateHikingBoundary({ ...stop, overnightReview: unknown }, 80374.40696857945, points, []).locationName === saved.locationName);
  rejects(() => validateHikingBoundary({ ...stop, endDistanceKm: 14.4 }, 80374.40696857945, points, []));
});

Deno.test('overnight and water quotes must come from successful reads, not snippets or invented sources', () => {
  rejects(() => validateHikingBoundary(endpoint, 72000, waypoints, []));
  for (const receipt of [
    { ...receipts[0], status: 'failed' },
    { ...receipts[0], tool_name: 'search_travel_web' },
    { ...receipts[0], output: { ...receipts[0].output, available: false } },
  ]) rejects(() => validateHikingBoundary(endpoint, 72000, waypoints, [receipt]));
  for (const patch of [{ sourceUrl: 'https://other.example.com/' }, { campQuote: 'Invented safe campsite statement.' }, { waterQuote: 'Clean water is always available.' }]) {
    rejects(() => validateHikingBoundary({ ...endpoint, overnightReview: { ...review, ...patch } }, 72000, waypoints, receipts));
  }
});

Deno.test('unknown water requires an explicit plan and is not upgraded to reported water', () => {
  const unknown = { ...review, waterStatus: 'unknown' as const, waterQuote: '' };
  assert(validateHikingBoundary({ ...endpoint, overnightReview: unknown }, 72000, waypoints, receipts).source === 'waypoint');
  rejects(() => validateHikingBoundary({ ...endpoint, overnightReview: { ...unknown, waterPlan: '' } }, 72000, waypoints, receipts));
});

Deno.test('a dry overnight camp is allowed with carried water, without a positive water report', () => {
  const dryQuote = 'There was no water at Lake Camp.';
  const dry = { ...review, waterStatus: 'unavailable' as const, waterQuote: dryQuote,
    waterPlan: 'Carry an estimated 5 L in 6 L capacity from the trailhead for drinking, dinner, breakfast and the next morning, including reserve. Verify trailhead supply; retreat if dry.',
  };
  const reads = [{ ...receipts[0], output: { ...receipts[0].output, text: `${campQuote}\n${dryQuote}` } }];
  assert(validateHikingBoundary({ ...endpoint, overnightReview: dry }, 72000, waypoints, reads).source === 'waypoint');
});

Deno.test('selected image text can ground a camp but image URLs and model observations alone cannot', () => {
  const image = { tool_name: 'read_travel_guide_images', status: 'completed', output: { available: true, sourceUrl, images: [{ visibleText: `${campQuote} ${waterQuote}` }] } };
  assert(validateHikingBoundary(endpoint, 72000, waypoints, [image]).source === 'waypoint');
  rejects(() => validateHikingBoundary(endpoint, 72000, waypoints, [{ ...image, output: { ...image.output, images: [{ visibleText: '', observations: [campQuote, waterQuote] }] } }]));
});

Deno.test('trail finish needs no overnight review; explicit user distances stay unverified', () => {
  assert(validateHikingBoundary({ endDistanceKm: 72 }, 72000, [], []).source === 'distance');
  const manual = { endDistanceKm: 14.4, userDistanceQuote: '把第一天终点设为累计 14.4 公里' };
  assert(validateHikingBoundary(manual, 72000, [], [], manual.userDistanceQuote).locationName?.includes('未核实'));
  rejects(() => validateHikingBoundary(manual, 72000, [], [], '帮我规划五天'));
  rejects(() => validateHikingBoundary({ ...manual, endDistanceKm: 14 }, 72000, [], [], manual.userDistanceQuote));
  rejects(() => validateHikingBoundary({ endDistanceKm: NaN }, 72000, [], []));
});

Deno.test('a repeated name and distance beside a waypoint index is verified, not rejected', () => {
  const waypoints = [{ name: '第一天营地（热浪谷）', km: 13.247 }, { name: '终点', km: 19.463 }];
  // The planner commonly repeats what it read in the waypoint list; the index
  // stays authoritative and the copies are checked against it.
  const agree = resolveHikingEndpoint({ waypointIndex: 0, locationName: '第一天营地（热浪谷）', endDistanceKm: 13.247 }, 19_463, waypoints);
  assert(agree.locationName === '第一天营地（热浪谷）' && agree.endDistanceKm === 13.247, 'matching copies resolve from the index');
  const renamed = resolveHikingEndpoint({ waypointIndex: 1, locationName: ' 终点 ', endDistanceKm: 19.463 }, 19_463, waypoints);
  assert(renamed.locationName === '终点', 'whitespace around a copied name is tolerated');
  let mismatchName = '';
  try { resolveHikingEndpoint({ waypointIndex: 1, locationName: '某营地', endDistanceKm: 19.463 }, 19_463, waypoints); } catch (error) { mismatchName = (error as Error).message; }
  assert(mismatchName.includes('不一致'), `a contradicting name must still fail, got ${mismatchName}`);
  let mismatchKm = '';
  try { resolveHikingEndpoint({ waypointIndex: 0, locationName: '第一天营地（热浪谷）', endDistanceKm: 3.1 }, 19_463, waypoints); } catch (error) { mismatchKm = (error as Error).message; }
  assert(mismatchKm.includes('不一致'), `a contradicting distance must still fail, got ${mismatchKm}`);
  // The finish is the track's end, which need not be a named point, so the
  // planner's own label is kept; and an index that resolves to that same end is
  // the same request rather than a contradiction.
  const labelled = resolveHikingEndpoint({ trackFinish: true, locationName: '终点：卡尔杂' }, 19_463, waypoints);
  assert(labelled.locationName === '终点：卡尔杂' && Math.abs(labelled.endDistanceKm - 19.463) < 0.001, 'a supplied finish label is kept');
  const endIndex = resolveHikingEndpoint({ waypointIndex: 1, trackFinish: true }, 19_463, waypoints);
  assert(endIndex.locationName === '终点', 'an end-of-track index agrees with trackFinish');
  let both = '';
  try { resolveHikingEndpoint({ waypointIndex: 0, trackFinish: true }, 19_463, waypoints); } catch (error) { both = (error as Error).message; }
  assert(both.includes('二选一'), `a mid-track index beside trackFinish stays ambiguous, got ${both}`);
});
