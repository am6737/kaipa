import { setTimeout as sleep } from 'node:timers/promises';

// Keeps the rail timetable snapshots official plans read (app-agent
// rail-timetable.ts) warm. Each call to the app-agent `refresh_rail_timetables`
// action asks 12306, through the one-slot rail-query sidecar, what a plan from
// one hub city would ask. 12306 is unofficial and rate-sensitive, so this runs
// only in the Asia/Shanghai night window, one city at a time with a pause in
// between, and pairs refreshed within RAIL_REFRESH_FRESH_DAYS are skipped.

const url = process.env.SUPABASE_URL || 'http://kong:8000';
const serviceKey = process.env.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Refresher credentials are missing');
const startHour = Number(process.env.RAIL_REFRESH_START_HOUR ?? 1);
const endHour = Number(process.env.RAIL_REFRESH_END_HOUR ?? 6);
const pauseMs = Number(process.env.RAIL_REFRESH_PAUSE_MS ?? 20_000);
const freshDays = Number(process.env.RAIL_REFRESH_FRESH_DAYS ?? 3);

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

const shanghaiHour = () => (new Date().getUTCHours() + 8) % 24;
const inWindow = () => { const hour = shanghaiHour(); return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour; };

async function refresh(offset) {
  const response = await fetch(`${url}/functions/v1/app-agent`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'refresh_rail_timetables', offset, limit: 1, freshDays }), signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`refresh_rail_timetables: HTTP ${response.status} ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

console.log(`Rail timetable refresher started (window ${startHour}:00-${endHour}:00 Asia/Shanghai)`);
let offset = 0, cycleQueried = 0;
while (!stopping) {
  if (!inWindow()) { await sleep(300_000); continue; }
  try {
    const result = await refresh(offset);
    cycleQueried += result.queried;
    if (result.queried || result.failed) console.log(`${result.cities.join(',')} ${result.date}: ${result.queried} queried, ${result.reused} fresh, ${result.failed} failed (${offset + 1}/${result.total})`);
    if (result.next == null) {
      console.log(`Cycle done: ${cycleQueried} queries`);
      offset = 0; cycleQueried = 0;
      // Nothing more to do tonight; the fresh-days skip makes the next pass cheap.
      while (!stopping && inWindow()) await sleep(300_000);
      continue;
    }
    offset = result.next;
    await sleep(result.queried ? pauseMs : 500);
  } catch (error) {
    console.warn(`Refresh failed at ${offset}: ${String(error).slice(0, 200)}`);
    await sleep(60_000);
  }
}
