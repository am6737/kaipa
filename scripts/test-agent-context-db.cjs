// Agent context SQL tests, run against the installed self-hosted schema.
//
// The tests are wrapped in a transaction that always rolls back, so they need
// no fixtures of their own. They no longer replay their migrations first: the
// 2026-07/08 agent migrations contain one-off geometry backfills written
// against journeys.track_coords, which 20260916120000_tracks_library.sql drops.
// Replaying them here would fail on a column that no longer exists, and they
// are already installed by infra/supabase/setup-kaipa-supabase.sh.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const tests = fs.readFileSync('supabase/tests/agent-context.sql', 'utf8') + '\n' + fs.readFileSync('supabase/tests/agent-schedule.sql', 'utf8');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${tests}\nrollback;\n`, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
console.log('Agent context SQL tests passed; all fixtures rolled back.');
