const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const migration = fs.readFileSync('supabase/migrations/20261008120000_membership_foundation.sql', 'utf8')
  .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
const tests = fs.readFileSync('supabase/tests/membership-foundation.sql', 'utf8');
const installed=spawnSync('docker',['exec','kaipa-supabase-db','psql','-X','-At','-U','postgres','-d','postgres','-c',"select to_regclass('public.membership_runtime') is not null"],{encoding:'utf8'});
if(installed.status!==0) throw new Error('Unable to inspect self-hosted database');
const result = spawnSync('docker', ['exec', '-i', 'kaipa-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
  input: `begin;\n${installed.stdout.trim()==='t'?'':migration}\n${tests}\nrollback;`, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
console.log('Membership identity, campaign expiry, RLS, stock limits and reservation recovery passed; migration and fixtures rolled back.');
