import assert from 'node:assert/strict';
import { formatJourneyVersionRelativeTime as formatJourneyVersionTime } from '../src/components/journey/journeyVersionPresentation.ts';

const now = new Date(2026, 8, 7, 12);
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const ago = (elapsed, locale = 'zh') =>
  formatJourneyVersionTime(new Date(now.getTime() - elapsed).toISOString(), locale, now);

assert.equal(ago(0), '刚刚');
assert.equal(ago(59_999), '刚刚');
assert.equal(ago(minute), '1分钟前');
assert.equal(ago(hour - 1), '59分钟前');
assert.equal(ago(hour), '1小时前');
assert.equal(ago(day - 1), '23小时前');
assert.equal(ago(day), '1天前');
assert.equal(ago(7 * day - 1), '6天前');
assert.equal(ago(7 * day), '8月31日');
assert.equal(ago(-minute), '刚刚');
assert.equal(ago(0, 'en'), 'Just now');
assert.equal(ago(2 * minute, 'en'), '2 minutes ago');
assert.equal(ago(hour, 'en'), '1 hour ago');
assert.equal(ago(2 * day, 'en'), '2 days ago');
assert.equal(ago(7 * day, 'en'), 'Aug 31');
assert.equal(formatJourneyVersionTime('invalid', 'zh', now), '');
const lastYear = new Date(2025, 11, 31, 12).toISOString();
const newYear = new Date(2026, 0, 1, 12);
assert.equal(formatJourneyVersionTime(lastYear, 'zh', newYear), '2025年12月31日');
assert.equal(formatJourneyVersionTime(lastYear, 'en', newYear), 'Dec 31, 2025');

const relativeTimeFormat = Object.getOwnPropertyDescriptor(Intl, 'RelativeTimeFormat');
try {
  Object.defineProperty(Intl, 'RelativeTimeFormat', { configurable: true, value: undefined });
  for (const [elapsed, zh, en] of [
    [0, '刚刚', 'Just now'],
    [minute, '1分钟前', '1 minute ago'],
    [2 * minute, '2分钟前', '2 minutes ago'],
    [hour, '1小时前', '1 hour ago'],
    [2 * hour, '2小时前', '2 hours ago'],
    [day, '1天前', '1 day ago'],
    [2 * day, '2天前', '2 days ago'],
    [7 * day, '8月31日', 'Aug 31'],
  ]) {
    assert.equal(ago(elapsed), zh);
    assert.equal(ago(elapsed, 'en'), en);
  }
} finally {
  if (relativeTimeFormat) Object.defineProperty(Intl, 'RelativeTimeFormat', relativeTimeFormat);
  else delete Intl.RelativeTimeFormat;
}

console.log('Journey version time tests passed.');
