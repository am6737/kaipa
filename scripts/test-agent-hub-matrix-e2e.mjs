// Live self-hosted matrix for the app-agent transport hub chain.
// This file intentionally performs network/database writes only without --list, --dry-run, or --self-test.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const SHANGHAI = 'Asia/Shanghai';
const DEFAULT_REPORT = '/tmp/kaipa-hub-matrix.json';
const RUN_DEADLINE_MS = 11 * 60_000;
const DEFAULT_GAP_MS = 20_000;

function dateInShanghai(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SHANGHAI, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + offsetDays));
  return date.toISOString().slice(0, 10);
}

function location(placeName, latitude, longitude) {
  return { status: 'available', latitude, longitude, accuracy: 20, timestamp: Date.now(), coordinateSystem: 'WGS84', placeName };
}

const today = dateInShanghai();
const cases = [
  {
    id: 'T1', name: 'nanning-nodate', route: '党岭三湖连穿', days: 6, mode: null, dateOffset: null,
    currentLocation: location('广西壮族自治区 南宁市 良庆区', 22.75, 108.38),
    prompt: '帮我创建并完整规划党岭三湖连穿，6天，不指定出发日期，包含往返大交通、住宿和徒步安排；大交通方式不指定，不需要装备清单。',
    expect: { rail: true, day1: ['南宁东', '成都'], last: ['成都', '南宁东'], noDistrict: '良庆区', defaultUntimed: true },
  },
  {
    id: 'T2', name: 'nanning-dated', route: '党岭三湖连穿', days: 6, mode: 'rail', dateOffset: 3,
    currentLocation: location('广西壮族自治区 南宁市 良庆区', 22.75, 108.38),
    prompt: `帮我创建并完整规划${todayPlus(3)}出发、全程6天的党岭三湖连穿，包含往返高铁大交通、住宿和徒步安排，不需要装备清单。`,
    expect: { rail: true, day1: ['南宁东', '成都'], last: ['成都', '南宁东'], noDistrict: '良庆区', timed: true },
  },
  {
    id: 'T3', name: 'beijing-rail-yala', route: '雅拉温泉线', days: 6, mode: 'rail', dateOffset: 3,
    currentLocation: location('北京市 朝阳区', 39.92, 116.44),
    prompt: `帮我创建并完整规划${todayPlus(3)}从北京出发、全程6天的雅拉温泉线，包含往返高铁大交通、住宿和徒步安排，不需要装备清单。`,
    expect: { rail: true, originCity: '北京', arrivalCity: '成都', onward: '康定' },
  },
  {
    id: 'T4', name: 'shanghai-flight-genie', route: '格聂牧场线', days: 7, mode: 'flight', dateOffset: 5,
    currentLocation: location('上海市 浦东新区', 31.22, 121.54),
    prompt: `帮我创建并完整规划${todayPlus(5)}从上海出发、全程7天的格聂牧场线，包含往返飞机大交通、住宿和徒步安排，不需要装备清单。`,
    expect: { flight: true, originCity: '上海', noBareAirport: true },
  },
  {
    id: 'T5', name: 'harbin-presale', route: '党岭三湖连穿', days: 6, mode: 'rail', dateOffset: 20,
    currentLocation: location('黑龙江省 哈尔滨市 南岗区', 45.76, 126.65),
    prompt: `帮我创建并完整规划${todayPlus(20)}从哈尔滨出发、全程6天的党岭三湖连穿，往返乘高铁，包含住宿和徒步安排，不需要装备清单。`,
    expect: { rail: true, originCity: '哈尔滨', defaultUntimed: true },
  },
  {
    id: 'T6', name: 'explicit-origin', route: '雅拉温泉线', days: 6, mode: null, dateOffset: 3,
    currentLocation: location('广西壮族自治区 南宁市', 22.82, 108.32),
    prompt: `帮我创建并完整规划${todayPlus(3)}从深圳出发、全程6天的雅拉温泉线，包含往返大交通、住宿和徒步安排；大交通优先高铁，不需要装备清单。`,
    expect: { rail: true, originCity: '深圳', forbidOrigin: '南宁' },
  },
  {
    id: 'T7', name: 'chengdu-origin', route: '党岭三湖连穿', days: 6, mode: null, dateOffset: null,
    currentLocation: location('四川省 成都市 武侯区', 30.64, 104.04),
    prompt: '帮我创建并完整规划党岭三湖连穿，6天，从成都出发并返回成都，包含往返大交通和当地交通、住宿和徒步安排；不需要装备清单。',
    expect: { groundOnly: true, originCity: '成都' },
  },
  {
    id: 'T8', name: 'county-origin', route: '党岭三湖连穿', days: 6, mode: null, dateOffset: 3,
    currentLocation: location('广西壮族自治区 百色市 凌云县', 24.35, 106.56),
    prompt: `帮我创建并完整规划${todayPlus(3)}从广西凌云县出发、全程6天的党岭三湖连穿，包含往返大交通、住宿和徒步安排；大交通优先高铁，不需要装备清单。`,
    expect: { rail: true, groundBefore: ['凌云', '百色'] },
  },
  {
    id: 'T9', name: 'kunming-selfdrive', route: '亚丁大转山', days: 8, mode: 'self_drive', dateOffset: null,
    currentLocation: location('云南省 昆明市 五华区', 25.04, 102.70),
    prompt: '帮我创建并完整规划亚丁大转山，8天，从昆明自驾往返，包含往返自驾大交通和高德驾车路线、住宿和徒步安排，不需要装备清单。',
    expect: { groundOnly: true, selfDrive: true, originCity: '昆明' },
  },
  {
    id: 'T10', name: 'beijing-wugong', route: '武功山反穿', days: 5, mode: null, dateOffset: 3,
    currentLocation: location('北京市', 39.90, 116.40),
    prompt: `帮我创建并完整规划${todayPlus(3)}从北京出发、全程5天的武功山反穿，包含往返大交通、住宿和徒步安排；不需要装备清单。`,
    expect: { hub: true, originCity: '北京' },
  },
  {
    id: 'T11', name: 'guangzhou-yubeng', route: '雨崩徒步', days: 7, mode: 'flight', dateOffset: 5,
    currentLocation: location('广东省 广州市 天河区', 23.13, 113.36),
    prompt: `帮我创建并完整规划${todayPlus(5)}从广州出发、全程7天的雨崩徒步，包含往返飞机大交通、住宿和徒步安排，不需要装备清单。`,
    expect: { flight: true, originCity: '广州', noBareAirport: true },
  },
  {
    id: 'T12', name: 'urumqi-xiate', route: '夏特古道', days: 8, mode: null, dateOffset: 3,
    currentLocation: location('新疆维吾尔自治区 乌鲁木齐市 天山区', 43.79, 87.63),
    prompt: `帮我创建并完整规划${todayPlus(3)}从乌鲁木齐出发、全程8天的夏特古道，包含往返大交通、住宿和徒步安排；不需要装备清单。`,
    expect: { hubOrFallback: true, originCity: '乌鲁木齐', day1Nonempty: true },
  },
  {
    id: 'T13', name: 'pingxiang-wugong', route: '武功山反穿', days: 5, mode: null, dateOffset: null,
    currentLocation: location('江西省 萍乡市 安源区', 27.62, 113.85),
    prompt: '帮我创建并完整规划武功山反穿，5天，从萍乡出发并返回萍乡，包含往返大交通和当地交通、住宿和徒步安排；不需要装备清单。',
    expect: { groundOnly: true, originCity: '萍乡' },
  },
];
function todayPlus(offset) { return dateInShanghai(offset); }

function parseArgs(argv) {
  const selected = argv.find(arg => arg.startsWith('--case='))?.slice(7);
  return {
    list: argv.includes('--list'), dryRun: argv.includes('--dry-run'), selfTest: argv.includes('--self-test'),
    ids: selected ? selected.split(',').map(id => id.trim().toUpperCase()).filter(Boolean) : null,
    report: argv.find(arg => arg.startsWith('--report='))?.slice(9) || DEFAULT_REPORT,
    gapMs: Number(argv.find(arg => arg.startsWith('--gap-ms='))?.slice(9) || DEFAULT_GAP_MS),
  };
}

function selectedCases(ids) {
  if (!ids) return cases;
  const unknown = ids.filter(id => !cases.some(item => item.id === id));
  if (unknown.length) throw new Error(`Unknown case id(s): ${unknown.join(', ')}`);
  return cases.filter(item => ids.includes(item.id));
}

function assertCaseDefinitions(chosen = cases) {
  const failures = [];
  for (const item of chosen) {
    if (!/^T\d+$/.test(item.id) || !item.route || !item.prompt || !item.currentLocation?.placeName) failures.push(`${item.id}: incomplete definition`);
    if (!item.prompt.includes(item.route)) failures.push(`${item.id}: prompt omits exact route name`);
    if (item.mode && !['rail', 'flight', 'self_drive'].includes(item.mode)) failures.push(`${item.id}: invalid mode`);
    if (item.dateOffset != null && !item.prompt.includes(todayPlus(item.dateOffset))) failures.push(`${item.id}: prompt date mismatch`);
  }
  if (new Set(chosen.map(item => item.id)).size !== chosen.length) failures.push('duplicate case id');
  if (failures.length) throw new Error(failures.join('; '));
}

function printList() {
  for (const item of cases) console.log(`${item.id}\t${item.name}\t${item.route}\t${item.mode || 'unspecified'}\t${item.dateOffset == null ? 'no-date' : todayPlus(item.dateOffset)}`);
}
function printDryRun(chosen) {
  assertCaseDefinitions(chosen);
  console.log(`Dry run: ${chosen.length} case(s), no network or database access.`);
  for (const item of chosen) console.log(`\n${item.id} ${item.name}\n${item.prompt}\nlocation=${JSON.stringify(item.currentLocation)}`);
}

function asObject(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
function rowsForDay(rows, day) { return rows.filter(row => row.day === day).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)); }
function rowName(row) { return asObject(row.location)?.name || asObject(row.location)?.placeName || ''; }
function locatedRows(rows) { return rows.filter(row => row.location && rowName(row)); }
function allDays(rows) { return [...new Set(rows.map(row => row.day).filter(Boolean))].sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, ''))); }
function chain(rows, day) { return locatedRows(rowsForDay(rows, day)).map(rowName); }
function firstLocated(rows, day) { return locatedRows(rowsForDay(rows, day))[0]; }
function lastLocated(rows, day) { const values = locatedRows(rowsForDay(rows, day)); return values.at(-1); }
function containsName(rows, text) { return rows.some(row => rowName(row).includes(text) || String(row.title || '').includes(text)); }
function isHubRow(row) {
  const loc = asObject(row.location) || {};
  return ['rail', 'flight', 'train'].includes(loc.incomingMode) || /车次|航班|高铁|站|机场|车站/.test(`${row.title || ''}${rowName(row)}`);
}
function timedRows(rows) { return rows.filter(row => Number.isFinite(row.time_mins) && isHubRow(row)); }
function serviceCode(title) { return String(title || '').match(/\b[A-Z]{1,3}\d{2,5}\b/)?.[0]; }
function findArraysByKey(value, names, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) { if (names.has(key) && Array.isArray(child)) found.push(child); findArraysByKey(child, names, found); }
  return found;
}
function originCityFromLocation(placeName) {
  const tokens = String(placeName || '').split(/\s+/).filter(Boolean);
  const city = tokens.find(token => token.endsWith('市') && !token.includes('自治'));
  return city ? city.replace(/市$/, '') : (tokens[0] || '');
}
function activityDaysFromArtifacts(value, found = new Set()) {
  if (Array.isArray(value)) { value.forEach(child => activityDaysFromArtifacts(child, found)); return found; }
  if (!value || typeof value !== 'object') return found;
  if ((value.kind === 'activity' || value.type === 'activity') && value.day) found.add(String(value.day));
  for (const child of Object.values(value)) activityDaysFromArtifacts(child, found);
  return found;
}
function artifactFor(stages, stageName) { return stages.find(stage => stage.stage === stageName)?.artifact || null; }
function checkResult(name, ok, detail) { return { name, ok: Boolean(ok), detail: String(detail ?? '') }; }

function commonChecks({ item, rows, groups, stages, run, task }) {
  const checks = [];
  const days = allDays(rows), firstDay = days[0], lastDay = days.at(-1);
  const day1 = chain(rows, firstDay), last = chain(rows, lastDay);
  const transport = artifactFor(stages, 'transport') || {};
  const main = transport.mainTravel || transport.transport?.mainTravel || {};
  const queries = Array.isArray(main.queries) ? main.queries : [];
  const hubRows = rows.filter(isHubRow);
  checks.push(checkResult('day1-and-last-day-present', Boolean(firstDay && lastDay && day1.length && last.length), `Day 1=${day1.join(' → ') || '(empty)'}; last=${last.join(' → ') || '(empty)'}`));
  for (let index = 1; index < days.length; index += 1) {
    const previous = lastLocated(rows, days[index - 1]), next = firstLocated(rows, days[index]);
    checks.push(checkResult(`day-continuity-${days[index - 1]}-${days[index]}`, Boolean(previous && next && rowName(previous) === rowName(next)), `${days[index - 1]} ends ${rowName(previous) || '(none)'}; ${days[index]} starts ${rowName(next) || '(none)'}`));
  }
  const originCity = item.expect.originCity || originCityFromLocation(item.currentLocation.placeName);
  const originRows = rowsForDay(rows, firstDay);
  const firstHubIndex = originRows.findIndex(isHubRow);
  const bareOriginAfterHub = firstHubIndex >= 0 && originRows.slice(firstHubIndex + 1).some(row => rowName(row) === originCity || rowName(row) === `${originCity}市`);
  checks.push(checkResult('no-bare-origin-city-after-hub', !bareOriginAfterHub, `origin=${originCity || '(unknown)'}`));
  const bareNames = rows.filter(row => /^[A-Z]{3}$/.test(rowName(row)) || rowName(row) === '机场');
  checks.push(checkResult('no-bare-iata-or-airport', bareNames.length === 0, bareNames.map(rowName).join(', ') || 'none'));
  const timed = timedRows(rows);
  const queryText = JSON.stringify(queries.map(query => query.result));
  const missingCodes = timed.map(row => serviceCode(row.title)).filter(Boolean).filter(code => !queryText.includes(code));
  checks.push(checkResult('timed-service-codes-in-transport-artifact', missingCodes.length === 0, missingCodes.join(', ') || `${timed.length} timed hub row(s)`));
  const badCoords = hubRows.filter(row => { const loc = asObject(row.location) || {}; return !Number.isFinite(Number(loc.latitude)) || !Number.isFinite(Number(loc.longitude)); });
  checks.push(checkResult('hub-rows-have-finite-coordinates', badCoords.length === 0, badCoords.map(row => rowName(row)).join(', ') || `${hubRows.length} hub row(s)`));
  const activityArrays = findArraysByKey(stages, new Set(['activityDays']));
  const activityDays = new Set(activityArrays.flat().map(value => String(value).replace(/^Day\s*/i, 'Day ')));
  for (const day of activityDaysFromArtifacts(stages)) activityDays.add(day);
  // Track boundaries (trailhead/track end) may sit on adjacent transfer days; mid-track points may not.
  const midTrack = location => location.trackId && !(Number(location.trackMeters) <= 0
    || (location.trackLengthMeters != null && Number(location.trackMeters) >= Number(location.trackLengthMeters)));
  const gpxDays = new Set(rows.filter(row => midTrack(asObject(row.location) || {})).map(row => row.day));
  const gpxOutside = [...gpxDays].filter(day => activityDays.size && !activityDays.has(day));
  checks.push(checkResult('gpx-days-subset-of-activity-days', gpxDays.size === 0 || (activityDays.size > 0 && gpxOutside.length === 0), activityDays.size ? `activity=${[...activityDays].join(', ')}; gpx=${[...gpxDays].join(', ')}` : `activity days not exposed; gpx=${[...gpxDays].join(', ')}`));
  const saveArtifact = artifactFor(stages, 'save') || {};
  const failedOps = [];
  const inspectFailed = (value, path = 'save') => { if (!value || typeof value !== 'object') return; if (value.status === 'failed' || value.failed === true || value.outcome === 'failed') failedOps.push(path); for (const [key, child] of Object.entries(value)) inspectFailed(child, `${path}.${key}`); };
  inspectFailed(saveArtifact);
  if (artifactFor(stages, 'save') && stages.find(stage => stage.stage === 'save')?.status === 'failed') failedOps.push('save.stage');
  checks.push(checkResult('save-stage-has-no-failed-operations', failedOps.length === 0, failedOps.join(', ') || 'none'));
  const runStatus = run?.status || task?.outcome?.status;
  const outcomeStatus = task?.outcome?.status;
  const blocker = run?.error || task?.outcome?.blocker || task?.outcome?.pendingQuestion || (['blocked', 'partial', 'failed', 'incomplete'].includes(outcomeStatus) ? outcomeStatus : null);
  checks.push(checkResult('run-completed-or-explains-blocker', runStatus === 'completed' || Boolean(blocker), `status=${runStatus || '(unknown)'}; blocker=${blocker || 'none'}`));
  checks.push(checkResult('timeline-groups-have-notes', groups.length === 0 || groups.every(group => typeof group.note === 'string' && group.note.trim()), `${groups.length} group(s)`));
  return { checks, firstDay, lastDay, day1, last, main, hubRows };
}

function caseChecks(item, context) {
  const { rows, stages, main, day1, last, firstDay, lastDay } = context;
  const checks = [];
  const expect = item.expect;
  const titleText = rows.map(row => `${row.title || ''} ${rowName(row)}`).join(' ');
  checks.push(checkResult('requested-total-days', allDays(rows).length === item.days, `${allDays(rows).length} day(s), expected ${item.days}`));
  if (expect.day1) {
    const originIndex = day1.findIndex(name => name.includes(expect.day1[0]));
    const arrivalIndex = day1.findIndex(name => name.includes(expect.day1[1]));
    checks.push(checkResult('fixed-day1-hub-chain', originIndex === 0 && arrivalIndex > originIndex, day1.join(' → ')));
  }
  if (expect.last) {
    const originIndex = last.findIndex(name => name.includes(expect.last[0]));
    const returnIndex = last.findIndex(name => name.includes(expect.last[1]));
    checks.push(checkResult('fixed-last-day-reverse-chain', returnIndex === last.length - 1 && originIndex >= 0 && originIndex < returnIndex, last.join(' → ')));
  }
  if (expect.noDistrict) checks.push(checkResult('same-city-home-leg-omitted', !chain(rows, firstDay).some(name => name.includes(expect.noDistrict)) && !chain(rows, lastDay).some(name => name.includes(expect.noDistrict)), `${expect.noDistrict} absent from first/last days`));
  if (expect.timed) {
    const timed = rows.filter(row => isHubRow(row) && Number.isFinite(row.time_mins) && Number.isFinite(row.time_end_mins));
    checks.push(checkResult('dated-case-has-timed-provider-rows', timed.length > 0, `${timed.length} timed row(s)`));
    const out = main?.queries?.find(query => query.direction === 'outbound');
    const firstRows = rowsForDay(rows, firstDay).filter(row => isHubRow(row) && Number.isFinite(row.time_mins));
    checks.push(checkResult('outbound-times-are-chronological', firstRows.every((row, index) => index === 0 || row.time_mins >= firstRows[index - 1].time_mins), firstRows.map(row => row.time_mins).join(' < ')));
    checks.push(checkResult('timed-departure-before-arrival', timed.every(row => row.time_mins <= row.time_end_mins), timed.map(row => `${row.time_mins}-${row.time_end_mins}`).join(', ')));
    checks.push(checkResult('dated-provider-artifact-present', Boolean(out), out ? 'outbound query present' : 'outbound query missing'));
  }
  if (expect.rail) checks.push(checkResult('rail-mode-hub-chain', main?.queries?.some(query => query.mode === 'rail') || context.hubRows.some(row => (asObject(row.location) || {}).incomingMode === 'rail') || titleText.includes('车次'), `queries=${main?.queries?.map(query => query.mode).join(',') || 'none'}`));
  if (expect.flight) checks.push(checkResult('flight-mode-hub-chain', main?.queries?.some(query => query.mode === 'flight') || context.hubRows.some(row => (asObject(row.location) || {}).incomingMode === 'flight') || titleText.includes('航班'), `queries=${main?.queries?.map(query => query.mode).join(',') || 'none'}`));
  if (expect.defaultUntimed) checks.push(checkResult('unknown-service-uses-waiting-title', titleText.includes('车次待查') || titleText.includes('航班待查'), titleText.match(/车次待查|航班待查/)?.[0] || 'waiting title absent'));
  if (expect.originCity) checks.push(checkResult('origin-hub-city', day1.some(name => name.includes(expect.originCity) && /站|机场|东|北|南|西/.test(name)), day1.join(' → ')));
  if (expect.forbidOrigin) checks.push(checkResult('explicit-origin-overrides-gps', !day1.some(name => name.includes(expect.forbidOrigin)), day1.join(' → ')));
  if (expect.arrivalCity) checks.push(checkResult('arrival-hub-city', rows.some(row => isHubRow(row) && rowName(row).includes(expect.arrivalCity)), expect.arrivalCity));
  if (expect.onward) checks.push(checkResult('onward-ground-destination-present', containsName(rows, expect.onward), expect.onward));
  if (expect.flight) {
    const airportRows = rows.filter(row => /机场|airport/i.test(`${row.title || ''}${rowName(row)}`));
    checks.push(checkResult('flight-airports-use-chinese-names', airportRows.length >= 2 && airportRows.every(row => /[\u4e00-\u9fff]/.test(rowName(row)) && !/^[A-Z]{3}$/.test(rowName(row)) && rowName(row) !== '机场'), airportRows.map(rowName).join(', ') || 'no airport rows'));
  }
  if (expect.groundOnly) {
    checks.push(checkResult('ground-only-has-no-hub-rows', !context.hubRows.length, `${context.hubRows.length} hub row(s)`));
    checks.push(checkResult('ground-only-has-no-rail-flight-query', !(main?.queries || []).some(query => ['rail', 'flight'].includes(query.mode)), `queries=${main?.queries?.map(query => query.mode).join(',') || 'none'}`));
    checks.push(checkResult('ground-only-has-ground-estimate', JSON.stringify(stages).includes('高德') || JSON.stringify(stages).includes('AMap') || JSON.stringify(stages).includes('distanceMeters'), 'ground provider evidence'));
  }
  if (expect.selfDrive) checks.push(checkResult('self-drive-has-amap-estimate', JSON.stringify(stages).includes('高德') || JSON.stringify(stages).includes('AMap') || JSON.stringify(stages).includes('distanceMeters'), 'AMap/高德 estimate'));
  if (expect.groundBefore) {
    const firstNames = chain(rows, firstDay).join(' → ');
    const originIndex = firstNames.indexOf(expect.groundBefore[0]), hubIndex = firstNames.indexOf(expect.groundBefore[1]);
    const destinationIndex = firstNames.indexOf('成都');
    checks.push(checkResult('county-ground-leg-before-hub', originIndex >= 0 && hubIndex > originIndex && (destinationIndex < 0 || destinationIndex > hubIndex), firstNames));
  }
  if (expect.hub) checks.push(checkResult('hub-chain-present', context.hubRows.length >= 2, `${context.hubRows.length} hub row(s)`));
  if (item.id === 'T10') {
    const day1Hubs = rowsForDay(rows, firstDay).filter(isHubRow);
    const arrivalHub = day1Hubs.at(-1);
    checks.push(checkResult('resolved-arrival-hub-is-concrete', Boolean(arrivalHub && /站|机场|东|北|南|西/.test(rowName(arrivalHub)) && !['萍乡', '北京', '北京市'].includes(rowName(arrivalHub))), rowName(arrivalHub) || 'none'));
  }
  if (expect.hubOrFallback) {
    const fallback = titleText.includes('交通方式待定');
    checks.push(checkResult('day1-hub-or-fallback-present', context.hubRows.length >= 2 || fallback, `${day1.join(' → ')}; fallback=${fallback}`));
    if (fallback) checks.push(checkResult('fallback-has-ground-estimate', JSON.stringify(stages).includes('高德') || JSON.stringify(stages).includes('AMap') || JSON.stringify(stages).includes('distanceMeters'), 'fallback ground estimate'));
  }
  if (expect.day1Nonempty) checks.push(checkResult('day1-not-empty', day1.length > 0, day1.join(' → ')));
  return checks;
}

async function liveMain(options) {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(process.env.KAIPA_RUNTIME_ENV || 'infra/supabase/docker/.env');
  const { createClient } = await import('@supabase/supabase-js');
  const url = `http://127.0.0.1:${process.env.KONG_HTTP_PORT || '8010'}`;
  const admin = createClient(url, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.ANON_KEY, { auth: { persistSession: false } });
  const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data; };
  const runIds = new Set();
  const gapSnapshot = await checked(admin.from('route_guide_gaps').select('id,hit_count,last_seen_at,last_run_id,resolved_at'));
  const originalGaps = new Map(gapSnapshot.map(row => [row.id, row]));
  const report = { startedAt: new Date().toISOString(), today, cases: [], gapSnapshot };
  const turn = async (item, threadIdRef) => {
    const accepted = await checked(client.functions.invoke('app-agent', { body: {
      action: 'turn', clientRunId: randomUUID(), threadId: threadIdRef.value, message: item.prompt, currentLocation: { ...item.currentLocation, timestamp: Date.now() },
      locale: 'zh', clientLocalDate: today, clientTimeZone: SHANGHAI,
    } }));
    threadIdRef.value = accepted.threadId;
    runIds.add(accepted.runId);
    const started = Date.now();
    let run;
    for (;;) {
      run = await checked(client.from('agent_runs').select('status,error').eq('id', accepted.runId).single());
      if (run.status !== 'running') break;
      if (Date.now() - started >= RUN_DEADLINE_MS) throw new Error('run exceeded 11-minute deadline');
      await sleep(2000);
    }
    const taskRow = await checked(client.from('agent_task_states').select('state').eq('run_id', accepted.runId).single());
    const calls = await checked(client.from('agent_tool_calls').select('tool_name,status,arguments,output').eq('run_id', accepted.runId));
    const stages = await checked(client.from('agent_stages').select('stage,status,artifact').eq('run_id', accepted.runId).order('created_at'));
    const replyRows = await checked(client.from('agent_messages').select('content,ui').eq('thread_id', threadIdRef.value).eq('role', 'assistant').order('created_at', { ascending: false }).limit(1));
    const rows = await checked(client.from('timeline_rows').select('title,day,time_mins,time_end_mins,location,sort_order').order('sort_order'));
    const groups = await checked(client.from('timeline_groups').select('name,note').order('sort_order'));
    return { accepted, run, task: taskRow.state, calls, stages, reply: replyRows[0] || null, rows, groups, elapsedMs: Date.now() - started };
  };
  try {
    const chosen = selectedCases(options.ids);
    assertCaseDefinitions(chosen);
    console.log('Case\tStatus\tElapsed(s)');
    for (let index = 0; index < chosen.length; index += 1) {
      const item = chosen[index], started = Date.now(), caseReport = { id: item.id, name: item.name, prompt: item.prompt, status: 'FAIL', checks: [] };
      let userId;
      try {
        const email = `hub-matrix-${item.id.toLowerCase()}-${randomUUID()}@example.test`, password = randomUUID();
        userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
        await checked(client.auth.signInWithPassword({ email, password }));
        const threadRef = { value: undefined };
        const result = await turn(item, threadRef);
        const context = commonChecks({ item, rows: result.rows, groups: result.groups, stages: result.stages, run: result.run, task: result.task });
        caseReport.checks = [...context.checks, ...caseChecks(item, { ...context, rows: result.rows, stages: result.stages, main: context.main })];
        caseReport.status = caseReport.checks.every(check => check.ok) ? 'PASS' : (result.run.status === 'completed' ? 'FAIL' : 'BLOCKED');
        caseReport.elapsedMs = result.elapsedMs;
        caseReport.dayChains = Object.fromEntries(allDays(result.rows).map(day => [day, chain(result.rows, day)]));
        caseReport.turns = [{ message: item.prompt, accepted: result.accepted, task: result.task, calls: result.calls, reply: result.reply, elapsedMs: result.elapsedMs }];
        caseReport.stages = result.stages.map(stage => ({ stage: stage.stage, status: stage.status, artifact: stage.artifact }));
        caseReport.savedTimeline = { rows: result.rows, groups: result.groups };
        console.log(`${item.id} ${caseReport.status} ${Math.round((Date.now() - started) / 1000)}s`);
        for (const [day, names] of Object.entries(caseReport.dayChains)) console.log(`  ${day}: ${names.join(' → ') || '(empty)'}`);
        for (const check of caseReport.checks.filter(check => !check.ok)) console.log(`  FAIL ${check.name}: ${check.detail}`);
      } catch (error) {
        caseReport.status = 'FAIL'; caseReport.error = error instanceof Error ? error.message : String(error); caseReport.elapsedMs = Date.now() - started;
        console.log(`${item.id} FAIL ${Math.round(caseReport.elapsedMs / 1000)}s`); console.log(`  FAIL case-error: ${caseReport.error}`);
      } finally {
        try { await client.auth.signOut(); } catch {}
        if (userId) {
          try { await checked(admin.from('journeys').delete().eq('user_id', userId)); } catch (error) { caseReport.cleanupError = String(error); }
          try { await checked(admin.from('agent_threads').delete().eq('user_id', userId)); } catch (error) { caseReport.cleanupError = String(error); }
          try { await checked(admin.auth.admin.deleteUser(userId)); } catch (error) { caseReport.cleanupError = String(error); }
          caseReport.cleanedUp = !caseReport.cleanupError;
        }
      }
      report.cases.push(caseReport);
      // Per-case rows are deleted on cleanup, so keep a partial report in case the run is interrupted.
      await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
      if (index < chosen.length - 1 && options.gapMs > 0) await sleep(options.gapMs);
    }
  } finally {
    const restored = [], deleted = [];
    try {
      const after = await checked(admin.from('route_guide_gaps').select('id,hit_count,last_seen_at,last_run_id,resolved_at'));
      for (const row of after) {
        if (!originalGaps.has(row.id) && runIds.has(row.last_run_id)) { await checked(admin.from('route_guide_gaps').delete().eq('id', row.id)); deleted.push(row.id); continue; }
        const before = originalGaps.get(row.id);
        if (before && runIds.has(row.last_run_id) && JSON.stringify({ hit_count: before.hit_count, last_seen_at: before.last_seen_at, last_run_id: before.last_run_id, resolved_at: before.resolved_at }) !== JSON.stringify({ hit_count: row.hit_count, last_seen_at: row.last_seen_at, last_run_id: row.last_run_id, resolved_at: row.resolved_at })) {
          await checked(admin.from('route_guide_gaps').update({ hit_count: before.hit_count, last_seen_at: before.last_seen_at, last_run_id: before.last_run_id, resolved_at: before.resolved_at }).eq('id', row.id)); restored.push(row.id);
        }
      }
    } catch (error) { report.gapCleanupError = String(error); }
    report.gapCleanup = { restored, deleted, testRunIds: [...runIds] };
    report.finishedAt = new Date().toISOString();
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Gap hygiene: restored ${restored.length}${restored.length ? ` [${restored.join(', ')}]` : ''}, deleted ${deleted.length}${deleted.length ? ` [${deleted.join(', ')}]` : ''}.`);
  }
  const failures = report.cases.filter(item => item.status !== 'PASS');
  process.exitCode = failures.length ? 1 : 0;
}

function selfTest() {
  const syntheticStages = [{ stage: 'transport', artifact: { mainTravel: { queries: [{ result: { services: [{ serviceNumber: 'G123' }] } }] } } }, { stage: 'plan', artifact: { itineraryItems: [{ kind: 'activity', day: 'Day 2' }] } }, { stage: 'save', artifact: { operations: [{ status: 'completed' }] } }];
  const rows = [
    { title: 'G123 车次', day: 'Day 1', time_mins: 60, time_end_mins: 120, location: { name: '北京西', incomingMode: 'rail', latitude: 39.9, longitude: 116.3 }, sort_order: 1 },
    { title: '抵达', day: 'Day 1', location: { name: '成都东', incomingMode: 'rail', latitude: 30.6, longitude: 104.1 }, sort_order: 2 },
    { title: '徒步', day: 'Day 2', location: { name: '成都东', latitude: 30.6, longitude: 104.1, trackId: 'x' }, sort_order: 3 },
  ];
  const pass = commonChecks({ item: cases[2], rows, groups: [{ name: 'Day 1', note: 'ok' }], stages: syntheticStages, run: { status: 'completed' }, task: { outcome: { status: 'completed' } } }).checks;
  const bad = commonChecks({ item: cases[2], rows: [{ ...rows[0], location: { name: 'ABC', incomingMode: 'rail' } }, { ...rows[1], location: { name: '机场' } }], groups: [], stages: [{ stage: 'save', artifact: { operations: [{ status: 'failed' }] } }], run: { status: 'failed' }, task: { outcome: {} } }).checks;
  console.log(`Self-test passing synthetic case: ${pass.every(check => check.ok) ? 'PASS' : 'FAIL'}`);
  console.log(`Self-test failing synthetic case: ${bad.some(check => !check.ok) ? 'FAIL checks detected (expected)' : 'UNEXPECTED PASS'}`);
  if (!pass.every(check => check.ok) || !bad.some(check => !check.ok)) process.exitCode = 1;
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.list) printList();
  else if (options.selfTest) selfTest();
  else if (options.dryRun) printDryRun(selectedCases(options.ids));
  else await liveMain(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
