// One-shot: reproduce the owner's 党岭三湖连穿 planning run on a disposable
// account and verify the itinerary-coordinate fix live. Delete after use.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || 'infra/supabase/docker/.env');
const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });

const checked = async (request) => {
  const result = await request;
  if (result.error) throw result.error;
  return result.data;
};

const SOURCE_TRACK = '14de4e90-e27e-4e30-b160-cf7644ef164e';
const RUN_DEADLINE_MS = 12 * 60_000;
let userId = null;
let threadId = null;
let privatePath = null;

function buildGpx(track) {
  const coords = track.coords;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(coords[i][1] - coords[i - 1][1]), dLon = toRad(coords[i][0] - coords[i - 1][0]);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coords[i - 1][1])) * Math.cos(toRad(coords[i][1])) * Math.sin(dLon / 2) ** 2;
    cum.push(cum[i - 1] + 2 * R * Math.asin(Math.sqrt(a)));
  }
  const km = cum.map(m => m / 1000);
  const eleAt = (index) => {
    let best = 0, bestDist = Infinity;
    for (const p of track.elevation) {
      const d = Math.abs(p.km - km[index]);
      if (d < bestDist) { bestDist = d; best = p.ele; }
    }
    return best;
  };
  const durationMs = track.duration_ms || 0;
  const start = Date.UTC(2026, 3, 20, 0, 0, 0);
  const stamp = (index) => new Date(start + (cum[index] / cum.at(-1)) * durationMs).toISOString();
  const point = (lon, lat, i) => `      <trkpt lat="${lat}" lon="${lon}"><ele>${eleAt(i).toFixed(2)}</ele><time>${stamp(i)}</time></trkpt>`;
  const wpts = (track.waypoints || []).map(wp => {
    let index = 0, bestDist = Infinity;
    for (let i = 0; i < km.length; i++) { const d = Math.abs(km[i] - wp.km); if (d < bestDist) { bestDist = d; index = i; } }
    return `    <wpt lat="${coords[index][1]}" lon="${coords[index][0]}"><ele>${eleAt(index).toFixed(2)}</ele><name>${wp.name.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</name></wpt>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="kaipa-e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${track.name}</name><time>${stamp(0)}</time></metadata>
${wpts.join('\n')}
  <trk><name>${track.name}</name><trkseg>
${coords.map((c, i) => point(c[0], c[1], i)).join('\n')}
  </trkseg></trk>
</gpx>\n`;
}

try {
  const track = await checked(admin.from('tracks').select('*').eq('id', SOURCE_TRACK).single());
  const gpx = buildGpx(track);
  await writeFile('/tmp/dangling-repro.gpx', gpx);
  console.log(`GPX built: ${track.coords.length} pts, ${track.waypoints.length} waypoints`);

  const email = `coord-fix-e2e-${randomUUID().slice(0, 8)}@example.test`, password = randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  await anon.auth.setSession(signed.data); // persistSession:false drops the token otherwise
  const client = anon; // now carries the test user's session

  // Upload exactly as the app does: resources ticket, then user-session storage.upload.
  const bytes = new TextEncoder().encode(gpx);
  const prepared = await checked(client.functions.invoke('resources', {
    body: { action: 'upload_prepare', purpose: 'attachment', scope: userId, bytes: bytes.byteLength, mime: 'application/gpx+xml' },
  }));
  privatePath = prepared.path;
  await checked(client.storage.from(prepared.bucket).upload(prepared.path, bytes, { contentType: 'application/gpx+xml', upsert: false }));
  const sign = await checked(client.storage.from('kaipa-private').createSignedUrl(privatePath, 3600));
  const attachment = { kind: 'file', name: '党岭三湖连穿.gpx', mimeType: 'application/gpx+xml', url: sign.signedUrl, size: gpx.length };

  const message = '请规划党岭三湖连穿。日期：未设置日期，全程天数待定，请结合往返交通、接驳和徒步给出建议总天数，不要当作用户已确定的天数。轨迹：党岭三湖连穿.gpx 19.5 km +1614 m。请结合目的地安排每日户外旅程和装备清单。天数指从出发到返回的整个旅程，包含路上时间，不等于徒步天数。除非我明确说不用，默认安排往返大交通、进出山接驳和必要住宿。默认从当前位置出发并返回。结合交通耗时分配实际徒步日，说明全程天数与徒步天数。';
  const accepted = await checked(client.functions.invoke('app-agent', {
    body: {
      action: 'turn', clientRunId: randomUUID(), message, locale: 'zh',
      clientLocalDate: '2026-10-13', clientTimeZone: 'Asia/Shanghai',
      currentLocation: { status: 'available', latitude: 22.75, longitude: 108.38, accuracy: 20, timestamp: Date.now(), coordinateSystem: 'WGS84', placeName: '广西壮族自治区 南宁市 良庆区' },
      attachments: [attachment],
    },
  }));
  threadId = accepted.threadId;
  console.log(`run accepted: ${accepted.runId} status=${accepted.status}`);

  const started = Date.now();
  let run;
  for (;;) {
    run = await checked(admin.from('agent_runs').select('status,stage,error,final_output').eq('id', accepted.runId).single());
    if (run.status !== 'running') break;
    if (Date.now() - started > RUN_DEADLINE_MS) throw new Error('run deadline exceeded');
    await sleep(4000);
  }
  console.log(`run finished after ${((Date.now() - started) / 1000).toFixed(0)}s: ${run.status}${run.error ? ' error=' + JSON.stringify(run.error) : ''}`);
  console.log('final:', typeof run.final_output === 'string' ? run.final_output.slice(0, 300) : JSON.stringify(run.final_output).slice(0, 300));

  const calls = await checked(admin.from('agent_tool_calls').select('tool_name,status,error').eq('run_id', accepted.runId));
  for (const call of calls) console.log(`call ${call.tool_name}: ${call.status}${call.error ? ' ' + String(call.error).slice(0, 120) : ''}`);

  const saveStage = await checked(admin.from('agent_stages').select('artifact').eq('run_id', accepted.runId).eq('stage', 'save').maybeSingle());
  const journeyId = saveStage?.artifact?.journeyId;
  if (!journeyId) throw new Error('no journey saved');
  const rows = await checked(admin.from('timeline_rows').select('day,title,location').eq('journey_id', journeyId).order('sort_order'));
  console.log(`\njourney ${journeyId}: ${rows.length} rows`);
  let fabricatedLeft = 0, mapWithoutAddress = 0;
  const seen = new Map();
  for (const row of rows) {
    const l = row.location || {};
    console.log(`${row.day} | ${row.title} | ${l.name ?? '-'} | src=${l.source ?? '-'} | ${l.latitude ?? '-'},${l.longitude ?? '-'} | trackMeters=${l.trackMeters ?? '-'}`);
    if (l.source === 'map' && !l.address) mapWithoutAddress++;
    if (l.name && Number.isFinite(l.latitude) && Math.abs(l.latitude - 31.073537) < 1e-6 && Math.abs(l.longitude - 101.407867) < 1e-6 && !Number.isFinite(l.trackMeters)) fabricatedLeft++;
    if (l.name && Number.isFinite(l.latitude)) {
      const key = `${l.latitude.toFixed(6)},${l.longitude.toFixed(6)}`;
      const names = seen.get(key) || new Set(); names.add(l.name); seen.set(key, names);
    }
  }
  for (const [coord, names] of seen) if (names.size > 1) console.log(`OVERLAP at ${coord}: ${[...names].join(' / ')}`);
  const schedule = calls.filter(c => c.tool_name === 'update_journey_schedule');
  console.log(`\nsummary: fabricatedStartPins=${fabricatedLeft} mapWithoutAddress=${mapWithoutAddress} schedule=${schedule.map(c => c.status).join(',') || 'not-called'} journey=${journeyId}`);
  await writeFile('/tmp/dangling-repro-journey.json', JSON.stringify({ journeyId, runId: accepted.runId, login: { email, password }, rows }, null, 2));
  console.log('account + journey kept; credentials in /tmp/dangling-repro-journey.json');
} catch (error) {
  console.error('E2E FAILED:', error?.message || error);
  process.exitCode = 1;
} finally {
  if (userId && process.env.E2E_CLEANUP === '1') {
    if (privatePath) { try { await admin.storage.from('kaipa-private').remove([privatePath]); } catch {} }
    for (const table of ['timeline_rows', 'timeline_groups', 'journey_packing_items', 'journey_packing_lists', 'agent_tool_calls', 'agent_stages', 'agent_model_metrics', 'agent_messages', 'agent_task_states', 'agent_runs', 'agent_threads', 'tracks', 'journeys']) {
      try { await admin.from(table).delete().eq('user_id', userId); } catch {}
    }
    try { await admin.auth.admin.deleteUser(userId); } catch {}
    console.log('test account removed');
  }
}
