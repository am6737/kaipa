import { QueryError } from './policy.mjs';

export class QueryGate {
  cache = new Map();
  busy = false;
  nextCall = 0;
  failures = 0;
  openUntil = 0;
  pending = 0;
  tail = Promise.resolve();
  constructor(now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms))) { this.now = now; this.delay = delay; }
  // One active query plus one waiting direction; never retry an upstream call.
  async enqueue(q, query) {
    if (this.pending >= 2) throw new QueryError('rate_limited');
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    this.pending++;
    try {
      await previous;
      await this.delay(Math.max(0, this.nextCall - this.now()));
      return await this.run(q, query);
    } finally { this.pending--; release(); }
  }
  async run(q, query) {
    const key = JSON.stringify(q), cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return { ...cached.value, cached: true };
    if (this.now() < this.openUntil) throw new QueryError('temporarily_unavailable');
    if (this.busy || this.now() < this.nextCall) throw new QueryError('rate_limited');
    this.busy = true;
    try {
      const offers = await query(q);
      const value = { available: true, status: offers.length ? 'results' : 'empty', offers, retrievedAt: new Date(this.now()).toISOString(), cached: false };
      this.failures = 0;
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { value, expires: this.now() + 60000 });
      return value;
    } catch (e) {
      if (!(e instanceof QueryError) || e.status === 'provider_error') {
        if (++this.failures >= 3) this.openUntil = this.now() + 60000;
      }
      throw e;
    } finally { this.busy = false; this.nextCall = this.now() + 2000; }
  }
}
