// Focused supplement: real WS delivery through guard, not the prior full matrix.
// Invoked only inside the disposable stack; all SQL goes through its parent.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createInterface } = require('node:readline');
const { RealtimeClient } = require('@supabase/realtime-js');
const fixture = JSON.parse(fs.readFileSync('/fixture/http-fixture.json', 'utf8'));
const lines = createInterface({ input: process.stdin });
const pending = new Map();
const clients = [];
let sequence = 0, passed = 0;
lines.on('line', line => {
  const { id, result } = JSON.parse(line);
  pending.get(id)?.(result);
  pending.delete(id);
});
const sql = statement => new Promise(resolve => {
  const id = ++sequence;
  pending.set(id, resolve);
  console.log('SQL ' + JSON.stringify({ id, sql: statement }));
});
const pass = label => { passed++; console.log('PASS: ' + label); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function join(channel) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('UNVERIFIED: real WS join timed out')), 15000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(error); }
    });
  });
}
async function connect(role, endpoint = 'ws://localhost:8080/realtime/v1') {
  const received = [], frames = [];
  class ObservedSocket extends WebSocket {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', e => frames.push(e.data));
    }
  }
  const rt = new RealtimeClient(endpoint, {
    params: { apikey: fixture.anonKey }, timeout: 10000, transport: ObservedSocket,
  });
  clients.push(rt);
  await rt.setAuth(fixture.tokens[role]);
  const channel = rt.channel('journey-data:' + fixture[role])
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'journeys', filter: 'id=eq.' + fixture.journey },
      payload => received.push(payload));
  try { await join(channel); }
  catch (error) { rt.disconnect(); throw error; }
  return { rt, channel, received, frames };
}
(async () => {
  // Readiness errors/timeouts are UNVERIFIED, never counted as permission denials.
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://localhost:8080/functions/v1/journey-location', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fixture.tokens.owner },
        body: JSON.stringify({ journeyId: fixture.journey, action: 'snapshot' }),
        signal: AbortSignal.timeout(2000),
      });
      if (r.status === 200) break;
    } catch {}
    if (i === 59) throw new Error('UNVERIFIED: HTTP readiness');
    await pause(1000);
  }
  // Warm up the real upstream (Realtime may restart while seeding its tenant).
  // A startup connection failure is not a guard authorization verdict.
  for (let i = 0; i < 12; i++) {
    try {
      const ready = await connect('owner', 'ws://realtime-dev.supabase-realtime:4000/socket');
      ready.rt.disconnect();
      break;
    } catch (error) {
      if (i === 11) throw new Error('UNVERIFIED: upstream readiness: ' + error.message);
      await pause(1000);
    }
  }
  const owner = await connect('owner'), member = await connect('member');
  pass('two authenticated real WS clients subscribe through repository guard');
  await sql(`update public.journeys set name='Issue11 WS proof' where id='${fixture.journey}';`);
  for (let i = 0; i < 150; i++) {
    if ([owner, member].every(c => c.received.some(p => p.new.name === 'Issue11 WS proof'))) break;
    if (i === 149) throw new Error('UNVERIFIED: real postgres_changes delivery timed out');
    await pause(100);
  }
  for (const [role, client] of [['owner', owner], ['member', member]]) {
    const payload = client.received.find(p => p.new.name === 'Issue11 WS proof');
    assert.equal(payload.new.id, fixture.journey);
    assert.equal(payload.eventType, 'UPDATE');
    assert.ok(client.frames.every(f => typeof f === 'string'));
    pass(role + ' receives actual WAL postgres_changes over WS; incoming frames are JSON');
  }
  // On this established, otherwise functioning socket, a legacy track is denied.
  const legacy = owner.rt.channel('journey-presence:' + fixture.journey);
  owner.rt.push({
    topic: legacy.topic, event: 'presence',
    payload: { userId: fixture.member, longitude: 111, latitude: 26 }, ref: 'issue11-track-proof',
  });
  for (let i = 0; i < 50; i++) {
    if (owner.frames.some(f => typeof f === 'string' && f.includes('issue11-track-proof') && f.includes('legacy_location_disabled'))) break;
    if (i === 49) throw new Error('UNVERIFIED: existing socket explicit track denial missing');
    await pause(100);
  }
  pass('same existing real WS rejects legacy track with explicit guard error');
  await sql(`update public.journeys set name='Issue11 WS still live' where id='${fixture.journey}';`);
  for (let i = 0; i < 100; i++) {
    if ([owner, member].every(c => c.received.some(p => p.new.name === 'Issue11 WS still live'))) break;
    if (i === 99) throw new Error('UNVERIFIED: ordinary subscription damaged by legacy denial');
    await pause(100);
  }
  pass('ordinary real WS subscriptions still receive after rejected legacy track');
  // SDK v2 encodes even JSON broadcast payloads as binary. No app hook uses it.
  let encoded;
  owner.rt.encode({ topic: owner.channel.topic, event: 'broadcast', join_ref: '1', ref: '2',
    payload: { event: 'probe', payload: { text: 'JSON content' } } }, frame => { encoded = frame; });
  assert.ok(encoded instanceof ArrayBuffer);
  pass('installed SDK encodes JSON broadcast as binary; guard compatibility is limited to current postgres_changes calls');
  console.log('Follow-up summary: ' + passed + ' passed, 0 failed');
})().catch(error => {
  console.error(error.stack);
  process.exitCode = error instanceof assert.AssertionError ? 1 : 2;
}).finally(() => {
  clients.forEach(client => client.disconnect());
  lines.close();
  process.stdin.pause();
});
