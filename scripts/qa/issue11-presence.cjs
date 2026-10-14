// Child of issue11-isolated.cjs: uses only that harness's disposable Realtime.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { RealtimeClient } = require('@supabase/realtime-js');
const { once } = require('node:events');
const secret = fs.readFileSync('/fixture/runtime.env', 'utf8').match(/^API_JWT_SECRET=(.+)$/m)[1];
const fixture = JSON.parse(fs.readFileSync('/fixture/presence.json', 'utf8'));
function jwt(role, sub, isAnonymous = false) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = [encode({ alg: 'HS256', typ: 'JWT' }), encode({ role, sub, is_anonymous: isAnonymous,
    aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })].join('.');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}
const clients = [];
const results = [];
async function connect(role, sub, isAnonymous) {
  const token = jwt(role, sub, isAnonymous);
  const client = new RealtimeClient('ws://realtime-dev.supabase-realtime:4000/socket', {
    params: { apikey: token }, timeout: 5000,
  });
  clients.push(client);
  await client.setAuth(token);
  const channel = client.channel('journey-presence:' + fixture.journey);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('UNVERIFIED: subscription timeout')), 10000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        reject(new Error('UNVERIFIED: connection error ' + (error?.message || status)));
      }
    });
  });
  return channel;
}
async function publish(label, channel, identity, allowed) {
  const ack = await channel.track({ userId: identity, longitude: 110, latitude: 25, fixedAt: Date.now() });
  // A timeout/network error is never evidence of a secure rejection.
  if (ack !== 'ok') throw new Error('UNVERIFIED: track=' + ack + ' for ' + label);
  results.push({ label, passed: allowed, actual: 'SUBSCRIBED, track=ok' });
  console.log((allowed ? 'PASS: ' : 'FAIL: ') + label + ' — SUBSCRIBED, track=ok');
}
(async () => {
  const owner = await connect('authenticated', fixture.owner, false);
  await publish('legal owner publishes own identity', owner, fixture.owner, true);
  const member = await connect('authenticated', fixture.member, false);
  await publish('legal companion publishes own identity', member, fixture.member, true);
  await publish('member cannot self-report another user identity', member, fixture.owner, false);
  const unsigned = await connect('anon');
  await publish('unsigned anonymous publisher is rejected', unsigned, fixture.owner, false);
  const anonymousAuth = await connect('authenticated', fixture.anonymous, true);
  await publish('anonymous Auth account is rejected', anonymousAuth, fixture.owner, false);
  const outsider = await connect('authenticated', fixture.outsider, false);
  await publish('signed-in nonmember is rejected', outsider, fixture.owner, false);
  console.log('REVOKE_READY');
  process.stdin.resume();
  const revoked = await Promise.race([
    once(process.stdin, 'data'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('UNVERIFIED: revoke coordination timeout')), 15000).unref()),
  ]);
  if (!String(revoked[0]).includes('revoked')) throw new Error('UNVERIFIED: missing revocation acknowledgement');
  await publish('already-connected companion is rejected after removal', member, fixture.member, false);
  console.log('Presence summary: ' + results.filter(r => r.passed).length + ' passed, '
    + results.filter(r => !r.passed).length + ' failed');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
})().catch(error => { console.error(error.message); process.exitCode = 2; })
  .finally(async () => {
    for (const client of clients) { await client.removeAllChannels(); client.disconnect(); }
    process.stdin.pause();
  });
