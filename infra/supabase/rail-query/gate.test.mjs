import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryGate } from './gate.mjs';
import { QueryError } from './policy.mjs';
test('bounded queue serializes both directions without upstream retries', async () => {
  let now = 100000, release, calls = 0;
  const gate = new QueryGate(() => now, async ms => { now += ms; });
  const first = gate.enqueue({ id: 1 }, async () => { calls++; return await new Promise(resolve => { release = resolve; }); });
  const second = gate.enqueue({ id: 2 }, async () => { calls++; return []; });
  await assert.rejects(gate.enqueue({ id: 3 }, async () => []), /rate_limited/);
  assert.equal(calls, 1);
  release([]);
  await first;
  await second;
  assert.equal(calls, 2);
  assert.equal(now, 102000);
  assert.equal(gate.pending, 0);
});
test('one query at a time, short TTL preserves original retrieval time, cooldown and cache bound', async () => {
  let now = 100000, resolve;
  const gate = new QueryGate(() => now);
  const first = gate.run({ id: 1 }, () => new Promise(r => { resolve = r; }));
  await assert.rejects(gate.run({ id: 2 }, async () => []), /rate_limited/);
  resolve([{}]);
  const original = await first;
  now += 1000;
  const cached = await gate.run({ id: 1 }, () => { throw new Error('cache missed'); });
  assert.equal(cached.retrievedAt, original.retrievedAt);
  assert.equal(cached.cached, true);
  await assert.rejects(gate.run({ id: 2 }, async () => []), /rate_limited/);
  now += 60000;
  assert.equal((await gate.run({ id: 1 }, async () => [])).cached, false);
  for (let id = 0; id < 110; id++) { now += 3000; await gate.run({ id }, async () => []); }
  assert.equal(gate.cache.size, 100);
});
test('three provider failures open breaker, no retry, half-open recovery; input errors do not count', async () => {
  let now = 100000, calls = 0;
  const gate = new QueryGate(() => now);
  await assert.rejects(gate.run({}, async () => { throw new QueryError('invalid_station'); }), /invalid_station/);
  assert.equal(gate.failures, 0);
  for (let i = 0; i < 3; i++) {
    now += 3000;
    await assert.rejects(gate.run({}, async () => { calls++; throw new Error('network'); }), /network/);
  }
  now += 3000;
  await assert.rejects(gate.run({}, async () => { calls++; return []; }), /temporarily_unavailable/);
  assert.equal(calls, 3);
  now += 60000;
  assert.equal((await gate.run({}, async () => [])).status, 'empty');
  assert.equal(gate.failures, 0);
});
