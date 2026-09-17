const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const sql = fs.readFileSync('supabase/migrations/20260908120000_agent_packing_drafts.sql', 'utf8');
const test = fs.readFileSync('supabase/tests/agent-packing-drafts.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${sql}\n${test}\nrollback;`, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('Draft/metrics owner-read isolation and service-only writes passed; fixtures rolled back.');
