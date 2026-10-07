const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const migration = fs.readFileSync('supabase/migrations/20261007140000_route_guide_import.sql', 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '');
const sql = fs.readFileSync('supabase/tests/route-guide-import.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${migration}\n${sql}\nrollback;`, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('PASS: template itinerary + personal packing, atomic rollback, retry deduplication, route/duration checks, existing-data protection and owner isolation. All fixtures rolled back.');
