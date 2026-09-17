const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const migration = fs.readFileSync('supabase/migrations/20260908040000_agent_task_harness.sql', 'utf8');
const tests = fs.readFileSync('supabase/tests/agent-task-harness.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${migration}\n${tests}\nrollback;\n`, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('Task scope RLS and atomic finalization passed; all fixtures and schema changes rolled back.');
