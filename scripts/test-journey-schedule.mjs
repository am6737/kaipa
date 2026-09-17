import assert from 'node:assert/strict';
import { journeyCalendarDays, journeySchedulePatch } from '../src/lib/journeySchedule.ts';

const start = new Date(2026, 8, 9, 9);
const pending = journeySchedulePatch({ start, flexible: true }, '');
assert.deepEqual(pending, { date: undefined, plannedDate: undefined, days: undefined, totalDays: undefined, countdown: undefined });
const daysOnly = journeySchedulePatch({ start, flexible: true, totalDays: 3 }, '3 days');
assert.equal(daysOnly.totalDays, 3);
assert.equal(daysOnly.days, '3 days');
assert.equal(daysOnly.plannedDate, undefined);
assert.equal(daysOnly.countdown, undefined);
const dated = journeySchedulePatch({ start, flexible: false, totalDays: 3 }, '3 days');
assert.equal(dated.plannedDate, '2026-09-09');
assert.equal(dated.date, '2026-09-09');
assert.equal(dated.totalDays, 3);
assert.deepEqual({ ...dated, ...pending }, pending, 'clearing a saved schedule removes all timing fields');
assert.equal(journeySchedulePatch({ start, flexible: false }, '').date, undefined, 'unknown duration cannot invent a dated one-day trip');
for (const totalDays of [0, -1, NaN, 1.5]) {
  assert.equal(journeySchedulePatch({ start, flexible: true, totalDays }, '').totalDays, undefined);
}
assert.equal(journeyCalendarDays(start, start), 1);
assert.equal(journeyCalendarDays(start, new Date(2026, 8, 11)), 3);
assert.equal(journeyCalendarDays(new Date(2026, 11, 31), new Date(2027, 0, 2)), 3);
assert.equal(journeyCalendarDays(new Date(2024, 1, 28), new Date(2024, 2, 1)), 3);
assert.equal(journeyCalendarDays(new Date(2026, 2, 7), new Date(2026, 2, 9)), 3);
console.log('Journey schedule tests passed.');
