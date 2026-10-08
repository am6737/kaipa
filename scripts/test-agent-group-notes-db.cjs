const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const migration = fs.readFileSync('supabase/migrations/20261008150000_agent_itinerary_group_notes.sql', 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
const sql = fs.readFileSync('supabase/tests/agent-group-notes.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${migration}\n${sql}\nrollback;`, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('PASS: daily notes and rows saved atomically, existing notes preserved, context includes summaries, owner isolation, undo restoration and edit-conflict protection. Fixtures rolled back.');
