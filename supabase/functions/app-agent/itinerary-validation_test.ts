import { itineraryValidationError, validIsoDate, validateItineraryItems, validateItineraryConflicts } from './itinerary-validation.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('itinerary validation rejects vague and duplicate items', () => {
  const issues = validateItineraryItems([
    { day: 'Day 1', title: '早餐', timeStart: '08:00', timeEnd: '08:30' },
    { day: '第一天', title: '灵隐寺游览', timeStart: '09:00', timeEnd: '11:00' },
    { day: 'Day 1', title: '灵隐寺游览', timeStart: '11:00', timeEnd: '12:00' },
  ], 1);
  assert(issues.length === 2, `expected 2 issues, got ${itineraryValidationError(issues)}`);
});

Deno.test('itinerary validation rejects placeholder transport modes', () => {
  const issues = validateItineraryItems([
    { day: 'Day 1', title: '杭州市区乘公共交通前往九溪', timeStart: '07:30', timeEnd: '08:30' },
  ], 1);
  assert(issues.length === 1, `expected 1 issue, got ${itineraryValidationError(issues)}`);
  assert(issues[0].message.includes('交通方式'), 'expected a concrete transport mode error');
});

Deno.test('itinerary validation rejects invalid ranges and ordering', () => {
  const issues = validateItineraryItems([
    { day: 'Day 1', title: '九溪烟树徒步', timeStart: '10:00', timeEnd: '09:00' },
    { day: 'Day 1', title: '龙井村午餐', timeStart: '08:00', timeEnd: '09:00' },
    { day: 'Day 3', title: '云栖竹径徒步', timeStart: '09:30' },
  ], 2);
  assert(issues.length === 3, `expected 3 issues, got ${itineraryValidationError(issues)}`);
});

Deno.test('itinerary validation accepts actionable and overnight items', () => {
  const issues = validateItineraryItems([
    { day: 'Day 1', title: '从杭州东站乘地铁至龙翔桥', timeStart: '07:30', timeEnd: '08:15' },
    { day: 'Day 1', title: '北山街至灵隐寺徒步', timeStart: '09:00', timeEnd: '12:00' },
    { day: 'Day 2', title: '乘夜行卧铺前往北京（次日抵达）', timeStart: '22:00', timeEnd: '06:30' },
  ], 2);
  assert(issues.length === 0, `expected no issues, got ${itineraryValidationError(issues)}`);
});

Deno.test('ISO journey date validation rejects rolled-over dates', () => {
  assert(validIsoDate('2026-09-10'), 'expected valid ISO date');
  assert(!validIsoDate('2026-9-10'), 'expected zero-padded date');
  assert(!validIsoDate('2026-02-30'), 'expected invalid calendar date');
});

Deno.test('itinerary detects overlapping activities and conflicts with saved rows', () => {
  const hike = { day: 'Day 1', title: '香山步道徒步', timeStart: '08:00', timeEnd: '16:00' };
  const bus = { day: 'Day 1', title: '乘公交前往颐和园', timeStart: '09:00', timeEnd: '10:00' };
  assert(validateItineraryItems([hike, bus], 1).length === 1, 'overlap in batch');
  assert(validateItineraryConflicts([bus], [hike]).length === 1, 'overlap with saved hike');
  assert(validateItineraryConflicts([{ ...bus, timeStart: '16:00', timeEnd: '17:00' }], [hike]).length === 0, 'adjacent ranges are valid');
  assert(validateItineraryConflicts([{ ...bus, day: 'Day 2' }], [hike]).length === 0, 'different days are independent');
  assert(validateItineraryConflicts([{ ...bus, timeEnd: undefined }], [hike]).length === 0, 'do not guess duration');
});

Deno.test('overnight travel conflicts with the next day but allows later activity', () => {
  const train = { day: 'Day 1', title: '卧铺列车次日抵达', timeStart: '22:00', timeEnd: '07:00' };
  assert(validateItineraryConflicts([{ day: 'Day 2', title: '山口出发', timeStart: '06:00', timeEnd: '08:00' }], [train]).length === 1, 'overnight overlap');
  assert(validateItineraryConflicts([{ day: 'Day 2', title: '山口出发', timeStart: '08:00', timeEnd: '10:00' }], [train]).length === 0, 'after arrival');
});
