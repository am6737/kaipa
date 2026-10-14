const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createInterface } = require('node:readline');
const { RealtimeClient } = require('@supabase/realtime-js');
const fixture = JSON.parse(
  fs.readFileSync('/fixture/http-fixture.json', 'utf8'),
);
const base = 'http://localhost:8080';
const pending = new Map();
let seq = 0,
  passed = 0;
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const r = JSON.parse(line);
  pending.get(r.id)?.(r.result);
  pending.delete(r.id);
});
function sql(statement) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    console.log('SQL ' + JSON.stringify({ id, sql: statement }));
  });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function pass(label) {
  passed++;
  console.log('PASS: ' + label);
}
async function http(path, body, token = fixture.tokens.owner, headers = {}) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: fixture.anonKey,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }
  return { status: response.status, data };
}
const location = (action, extra = {}, token = fixture.tokens.owner) =>
  http(
    '/functions/v1/journey-location',
    { action, journeyId: fixture.journey, ...extra },
    token,
  );
async function expect(label, promise, status) {
  const r = await promise;
  assert.equal(r.status, status, `${label}: ${JSON.stringify(r.data)}`);
  pass(label);
  return r.data;
}
const rtClients = [];
(async () => {
  // Readiness has its own failure classification, not an authorization pass.
  for (let i = 0; i < 60; i++) {
    let ready = false;
    try {
      const r = await location('snapshot');
      ready = r.status === 200;
    } catch {}
    if (ready) break;
    if (i === 59) {
      const r = await location('snapshot');
      throw new Error('UNVERIFIED: HTTP readiness ' + JSON.stringify(r));
    }
    await pause(1000);
  }
  await expect('no login rejected', location('open', {}, null), 401);
  await expect(
    'anonymous Auth rejected',
    location('open', {}, fixture.tokens.anonymous),
    403,
  );
  await expect(
    'forged JWT rejected',
    location('open', {}, fixture.tokens.member.slice(0, -5) + 'xxxxx'),
    401,
  );
  await expect(
    'nonmember rejected',
    location('open', {}, fixture.tokens.outsider),
    403,
  );
  await expect(
    'expired JWT rejected',
    location('open', {}, fixture.expiredToken),
    401,
  );
  await expect(
    'client cannot directly invoke trusted publisher RPC',
    http(
      '/rest/v1/rpc/journey_location_request',
      { p_actor: fixture.owner, p_journey: fixture.journey, p_action: 'open' },
      fixture.tokens.member,
    ),
    403,
  );
  await expect(
    'client cannot insert trusted distribution rows',
    http(
      '/rest/v1/journey_location_sessions',
      {
        journey_id: fixture.journey,
        user_id: fixture.owner,
        longitude: 110,
        latitude: 25,
      },
      fixture.tokens.member,
    ),
    403,
  );
  const owner = await expect('legal owner opens device', location('open'), 200);
  const member = await expect(
    'legal member opens device',
    location('open', {}, fixture.tokens.member),
    200,
  );
  const pub = {
    sessionId: member.sessionId,
    sequence: 1,
    longitude: 110,
    latitude: 25,
  };
  await expect(
    'member cannot report owner identity',
    location(
      'publish',
      { ...pub, userId: fixture.owner },
      fixture.tokens.member,
    ),
    403,
  );
  await expect(
    'invalid coordinate rejected',
    location('publish', { ...pub, latitude: 91 }, fixture.tokens.member),
    400,
  );
  const published = await expect(
    'legal member publishes',
    location('publish', pub, fixture.tokens.member),
    200,
  );
  assert.equal(published.userId, fixture.member);
  const snapshot = await expect(
    'second authenticated client receives member',
    location('snapshot'),
    200,
  );
  assert.equal(snapshot.peers.length, 1);
  assert.equal(snapshot.peers[0].userId, fixture.member);
  assert.equal(snapshot.peers[0].latitude, 25);
  pass('received identity and coordinates are server generated');
  await expect(
    'out-of-order sequence rejected',
    location('publish', pub, fixture.tokens.member),
    400,
  );
  const tablet = await expect(
    'second device opens independently',
    location('open', {}, fixture.tokens.member),
    200,
  );
  await expect(
    'tablet publishes',
    location(
      'publish',
      { ...pub, sessionId: tablet.sessionId, longitude: 111 },
      fixture.tokens.member,
    ),
    200,
  );
  await expect(
    'phone closes immediately',
    location('close', { sessionId: member.sessionId }, fixture.tokens.member),
    200,
  );
  const multi = await location('snapshot');
  assert.equal(multi.data.peers.length, 1);
  assert.equal(multi.data.peers[0].longitude, 111);
  pass('closing phone preserves tablet and folds one avatar');
  await expect(
    'late publish cannot resurrect closed device',
    location('publish', { ...pub, sequence: 2 }, fixture.tokens.member),
    403,
  );
  await expect(
    'legal owner publishes own location',
    location('publish', {
      sessionId: owner.sessionId,
      sequence: 1,
      longitude: 112,
      latitude: 26,
    }),
    200,
  );
  assert.ok(
    (await location('snapshot', {}, fixture.tokens.member)).data.peers.some(
      (p) => p.userId === fixture.owner,
    ),
  );
  pass('member receives legitimate owner location');
  await location('close', { sessionId: owner.sessionId });
  await sql(
    `delete from public.companions where journey_id='${fixture.journey}' and user_id='${fixture.member}';`,
  );
  await expect(
    'original device denied after member removal',
    location(
      'publish',
      { ...pub, sessionId: tablet.sessionId, sequence: 2 },
      fixture.tokens.member,
    ),
    403,
  );
  await expect(
    'removed viewer cannot receive snapshot',
    location('snapshot', {}, fixture.tokens.member),
    403,
  );
  assert.equal((await location('snapshot')).data.peers.length, 0);
  pass('trusted snapshot removes revoked publisher');
  await sql(
    `insert into public.companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order) values('${fixture.member}','${fixture.journey}','M','Member','#2E7D5B',false,false,0);`,
  );
  await expect(
    'rejoin cannot revive revoked lease',
    location(
      'publish',
      { ...pub, sessionId: tablet.sessionId, sequence: 2 },
      fixture.tokens.member,
    ),
    403,
  );
  const rejoined = await location('open', {}, fixture.tokens.member);
  await expect(
    'reconnect gets fresh authorization',
    location(
      'publish',
      { ...pub, sessionId: rejoined.data.sessionId },
      fixture.tokens.member,
    ),
    200,
  );
  await sql(
    `update public.journey_location_sessions set expires_at=now()-interval '1 second' where id='${rejoined.data.sessionId}';`,
  );
  await expect(
    'expired disconnected lease cannot publish',
    location(
      'publish',
      { ...pub, sessionId: rejoined.data.sessionId, sequence: 2 },
      fixture.tokens.member,
    ),
    403,
  );
  assert.equal((await location('snapshot')).data.peers.length, 0);
  pass('expired lease removed from snapshot');
  await sql(
    `update public.journeys set deleted_at=now() where id='${fixture.journey}';`,
  );
  await expect(
    'deleted journey owner publish rejected',
    location('publish', {
      sessionId: owner.sessionId,
      sequence: 1,
      longitude: 110,
      latitude: 25,
    }),
    403,
  );
  await sql(
    `update public.journeys set deleted_at=null where id='${fixture.journey}';`,
  );

  const shareResult = await sql(
    `select set_config('request.jwt.claim.sub','${fixture.owner}',false); select public.ensure_journey_share('${fixture.journey}')->>'code';`,
  );
  const code = shareResult.match(/\n ([0-9A-Z]{4})\s*\n/)[1];
  const guest = (action, extra = {}, token) =>
    http(
      '/functions/v1/resources',
      { action, ...extra },
      fixture.anonKey,
      token ? { 'x-guest-session': token } : {},
    );
  const session = await expect(
    'valid passphrase opens anonymous Web guest',
    guest('guest_open', { code }),
    200,
  );
  const token = session.token;
  const snap = await expect(
    'valid guest HTTP snapshot',
    guest('guest_snapshot', {}, token),
    200,
  );
  const moment = await expect(
    'valid guest HTTP text write',
    guest(
      'guest_add',
      { requestKey: 'http-valid', moment: { caption: 'valid', is_text: true } },
      token,
    ),
    200,
  );
  const ticket = await expect(
    'valid guest receives signed upload ticket',
    guest('guest_upload', { bytes: 3, mime: 'image/jpeg' }, token),
    200,
  );
  async function upload(t) {
    const r = await fetch(
      base +
        '/storage/v1/object/upload/sign/' +
        t.bucket +
        '/' +
        t.path +
        '?token=' +
        encodeURIComponent(t.token),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
        body: new Uint8Array([1, 2, 3]),
        signal: AbortSignal.timeout(10000),
      },
    );
    return { status: r.status, data: await r.json() };
  }
  await expect(
    'valid signed ticket uploads real Storage object',
    upload(ticket),
    200,
  );
  const issued = await expect(
    'issue second ticket before share expires',
    guest('guest_upload', { bytes: 3, mime: 'image/jpeg' }, token),
    200,
  );
  await sql(
    `update public.journey_shares set expires_at=now()-interval '1 second' where id='${snap.share.id}';`,
  );
  await expect(
    'expired old token HTTP read rejected',
    guest('guest_snapshot', {}, token),
    403,
  );
  await expect(
    'expired old token real Edge HTTP write rejected',
    guest(
      'guest_add',
      {
        requestKey: 'http-expired',
        moment: { is_text: true, caption: 'expired' },
      },
      token,
    ),
    403,
  );
  await expect(
    'expired old token HTTP deletion rejected',
    guest('guest_delete', { id: moment.id }, token),
    403,
  );
  await expect(
    'expired old token upload request rejected',
    guest('guest_upload', { bytes: 3, mime: 'image/jpeg' }, token),
    403,
  );
  // Storage returns a structured error for the actual superuser object INSERT;
  // it must reference the trigger rejection. A 5xx/timeout is not sufficient.
  const rejected = await upload(issued);
  assert.ok([400, 403].includes(rejected.status), JSON.stringify(rejected));
  assert.match(JSON.stringify(rejected.data), /guest_session_invalid/);
  pass(
    'previously signed ticket actual object upload rejected by guest trigger',
  );
  const count = await sql(
    `select count(*) from storage.objects where bucket_id='${issued.bucket}' and name='${issued.path}';`,
  );
  assert.match(count, /\n\s+0\s*\n/);
  pass('rejected real object never committed');
  await sql(
    `update public.journey_shares set expires_at=now()+interval '7 days' where id='${snap.share.id}';`,
  );
  const expiredTicket = await expect(
    'issue ticket for ticket-expiry upload check',
    guest('guest_upload', { bytes: 3, mime: 'image/jpeg' }, token),
    200,
  );
  await sql(
    `update public.resource_upload_tickets set expires_at=now()-interval '1 second' where id='${expiredTicket.id}';`,
  );
  const expiredUpload = await upload(expiredTicket);
  assert.ok(
    [400, 403].includes(expiredUpload.status),
    JSON.stringify(expiredUpload),
  );
  assert.match(
    JSON.stringify(expiredUpload.data),
    /Upload ticket expired or consumed/,
  );
  pass('ticket expiry rejects actual object upload');

  // A pre-cutover legacy connection is physically drained; a DNS/router switch
  // alone would leave it able to track. This touches only the disposable server.
  await pause(6000);
  let legacySocket;
  class LegacySocket extends WebSocket {
    constructor(...args) {
      super(...args);
      legacySocket = this;
    }
  }
  const old = new RealtimeClient(
    'ws://realtime-dev.supabase-realtime:4000/socket',
    {
      params: { apikey: fixture.anonKey },
      timeout: 5000,
      transport: LegacySocket,
    },
  );
  rtClients.push(old);
  await old.setAuth(fixture.tokens.member);
  const oldChannel = old.channel('journey-presence:' + fixture.journey);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('UNVERIFIED: legacy baseline join timeout')),
      10000,
    );
    oldChannel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR') {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
  assert.equal(
    await oldChannel.track({
      userId: fixture.owner,
      longitude: 110,
      latitude: 25,
      fixedAt: Date.now(),
    }),
    'ok',
  );
  pass('isolated old connection reproduces identity spoof before drain');
  const disconnected = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('UNVERIFIED: old socket drain not observed')),
      10000,
    );
    legacySocket.addEventListener('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await sql('DRAIN_ISOLATED_REALTIME');
  await disconnected;
  old.disconnect();
  await pause(6000);
  pass('controlled isolated restart closes already-connected old socket');

  // Real Realtime through the repository guard: a rejection ACK is mandatory.
  for (const role of ['owner', 'member', 'outsider', 'anonymous', 'unsigned']) {
    const rt = new RealtimeClient('ws://localhost:8080/realtime/v1', {
      params: { apikey: fixture.anonKey },
      timeout: 5000,
    });
    rtClients.push(rt);
    await rt.setAuth(fixture.tokens[role] || fixture.anonKey);
    const channel = rt.channel('journey-presence:' + fixture.journey);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('UNVERIFIED: guard join timed out')),
        10000,
      );
      channel.subscribe((status, error) => {
        if (
          status === 'CHANNEL_ERROR' &&
          error?.message?.includes('legacy_location_disabled')
        ) {
          clearTimeout(timer);
          resolve();
        } else if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          reject(
            new assert.AssertionError({ message: 'Legacy join accepted' }),
          );
        }
      });
    });
    pass(role + ' old public channel explicitly rejected');
  }
  await expect(
    'legacy HTTP broadcast denied',
    http(
      '/api/broadcast',
      {
        messages: [
          {
            topic: 'journey-presence:' + fixture.journey,
            event: 'location',
            payload: pub,
          },
        ],
      },
      fixture.serviceKey,
    ),
    403,
  );
  console.log('HTTP summary: ' + passed + ' passed, 0 failed');
})()
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = error instanceof assert.AssertionError ? 1 : 2;
  })
  .finally(async () => {
    for (const rt of rtClients) {
      rt.disconnect();
    }
    lines.close();
    process.stdin.pause();
  });
