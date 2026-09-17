import { createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const url = process.env.SUPABASE_URL || 'http://kong:8000';
const serviceKey = process.env.SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;
if (!serviceKey || !jwtSecret) throw new Error('Worker credentials are missing');

function userToken(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const value = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 600 })}`;
  return `${value}.${createHmac('sha256', jwtSecret).update(value).digest('base64url')}`;
}

async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Queue ${name}: HTTP ${response.status}`);
  return response.json();
}

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
console.log('Kaipa planning worker started');
while (!stopping) {
  try {
    const job = await rpc('claim_agent_job', {});
    if (!job) { await sleep(2000); continue; }
    console.log(`Executing planning run ${job.runId}`);
    const response = await fetch(`${url}/functions/v1/app-agent`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${userToken(job.userId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute_job', runId: job.runId, leaseToken: job.leaseToken }),
      signal: AbortSignal.timeout(310_000),
    });
    await response.arrayBuffer();
    console.log(`Planning run ${job.runId}: HTTP ${response.status}`);
    // A transport error does not mean the Edge worker stopped. The six-minute
    // lease outlives its five-minute hard limit; reclaim only after that lease.
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Worker request failed');
    await sleep(2000);
  }
}
