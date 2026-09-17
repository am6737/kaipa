import http from 'node:http';
import { Client } from './upstream/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from './upstream/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { QueryError, validateQuery, decode, stationCode, normalize } from './policy.mjs';
import { QueryGate } from './gate.mjs';
import { normalizeConnections } from './connections.mjs';

const gate = new QueryGate();
const limitation = 'Read-only unofficial MCP access to 12306 public queries, not an authorized booking API. Exact-station direct trains or one-page via-station connection candidates; coverage is partial. Check connection.status: only buffer_met meets the conservative 45-minute same-station planning floor, not an official transfer guarantee. Never recommend same_train_split, insufficient_buffer or station_change_unverified as validated transfers. Prices are per adult per leg, not through fares or group guarantees. -- means unknown. Empty is not proof of no service. Presale is at most 15 calendar days including today; station release times vary. Recheck official 12306 and station transfer access before purchase.';
function send(res, data, code = 200) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
async function query(q) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['build/index.js'], cwd: '/app/upstream',
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TZ: 'Asia/Shanghai' }, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'kaipa-rail-readonly', version: '1.0.0' });
  let timer;
  try {
    return await Promise.race([(async () => {
      await client.connect(transport);
      const call = async (name, args) => decode(await client.callTool({ name, arguments: args }, undefined, { timeout: 12000 }));
      const stations = await call('get-station-code-by-names', { stationNames: [q.origin, q.destination, q.viaStation].filter(Boolean).join('|') });
      const from = stationCode(stations, q.origin), to = stationCode(stations, q.destination);
      const via = q.viaStation ? stationCode(stations, q.viaStation) : undefined;
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (via) {
        const rows = await call('get-interline-tickets', { date: q.departureDate, fromStation: from, toStation: to, middleStation: via,
          limitedNum: 100, showWZ: false, format: 'json', earliestStartTime: q.earliestHour });
        return normalizeConnections(rows, q, from, to, via);
      }
      const rows = await call('get-tickets', { date: q.departureDate, fromStation: from, toStation: to, limitedNum: 0, format: 'json' });
      return normalize(rows, q, from, to);
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new QueryError('provider_error')), 22000); })]);
  } finally { clearTimeout(timer); await client.close().catch(() => {}); await transport.close().catch(() => {}); }
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, { ok: true });
  if (req.method !== 'POST' || req.url !== '/query') return send(res, { error: 'not_found' }, 404);
  let q;
  const base = { provider: '12306-mcp', offers: [], limitation };
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) { send(res, { error: 'too_large' }, 413); req.destroy(); return; } }
    try { q = validateQuery(JSON.parse(body)); } catch (e) { throw e instanceof QueryError ? e : new QueryError('invalid_request'); }
    send(res, { ...base, ...await gate.enqueue(q, query) });
  } catch (e) { send(res, { ...base, available: false, status: e instanceof QueryError ? e.status : 'provider_error', retrievedAt: new Date().toISOString() }); }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.maxConnections = 16;
server.listen(8787, '0.0.0.0');
