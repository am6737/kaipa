import { createServer } from 'node:http';
import { execFile } from 'node:child_process';

let active = 0;
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};
createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') return send(res, 200, { ready: !!process.env.FLYAI_API_KEY });
  if (req.url !== '/query' || req.method !== 'POST') return send(res, 404, {});
  if (!process.env.FLYAI_QUERY_TOKEN || req.headers.authorization !== `Bearer ${process.env.FLYAI_QUERY_TOKEN}`) return send(res, 401, {});
  if (!process.env.FLYAI_API_KEY) return send(res, 503, { status: 'not_configured' });
  if (active >= 4) return send(res, 429, { status: 'rate_limited' });
  let query;
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 4096) throw new Error('body_size');
    }
    query = JSON.parse(body);
    for (const name of ['origin', 'destination']) {
      if (typeof query[name] !== 'string' || !/^[\p{L}\p{N} .()（）·-]{1,120}$/u.test(query[name]) || query[name].startsWith('-')) throw new Error('place');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.departureDate) || new Date(`${query.departureDate}T00:00:00Z`).toISOString().slice(0, 10) !== query.departureDate) throw new Error('date');
    if (query.earliestHour != null && (!Number.isInteger(query.earliestHour) || query.earliestHour < 0 || query.earliestHour > 23)) throw new Error('hour');
  } catch { return send(res, 400, { status: 'invalid_request' }); }
  active++;
  const args = ['/app/node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs', 'search-flight', '--origin', query.origin,
    '--destination', query.destination, '--dep-date', query.departureDate, '--sort-type', '8'];
  if (query.earliestHour != null) args.push('--dep-hour-start', String(query.earliestHour));
  execFile(process.execPath, args, {
    timeout: 35000, maxBuffer: 2 * 1024 * 1024, killSignal: 'SIGKILL',
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', FLYAI_API_KEY: process.env.FLYAI_API_KEY, FLYAI_JSON: '1' },
  }, (error, stdout) => {
    active--;
    // Never expose upstream stderr (which could contain credentials).
    if (error) return send(res, 502, { status: 'provider_error' });
    try { send(res, 200, JSON.parse(stdout)); }
    catch { send(res, 502, { status: 'provider_error' }); }
  });
}).listen(8788, '0.0.0.0');
