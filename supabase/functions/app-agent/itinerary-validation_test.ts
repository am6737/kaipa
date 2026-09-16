import { itineraryValidationError, validIsoDate, validateItineraryItems } from './itinerary-validation.ts';

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
