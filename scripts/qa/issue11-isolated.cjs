// Read-only schema inspection of the source stack; all fixtures go to NEW containers.
// No migrations, user data, service keys, or writes to the shared runtime.
// Exit 1 = reproduced access gap; exit 2 = setup/unverified infrastructure error.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const repaired = process.env.KAIPA_ISSUE11_REPAIRED === '1';
const followup = process.env.KAIPA_ISSUE11_FOLLOWUP === '1';
if (followup && !repaired) throw new Error('Follow-up requires repaired isolation');
const evidence = process.env.KAIPA_ISSUE11_EVIDENCE_DIR;
if (!evidence) throw new Error('Set KAIPA_ISSUE11_EVIDENCE_DIR to a local evidence directory');
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaipa-issue11-'));
const source = process.env.KAIPA_ISSUE11_SOURCE_DB || 'kaipa-supabase-db';
const id = 'kaipa-issue11-' + crypto.randomUUID().slice(0, 8);
const db = id + '-db', realtime = id + '-realtime', client = id + '-client', network = id + '-net';
const created = [];
function run(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Docker command failed: ' + args.slice(0, 4).join(' ') + '\n' + result.stderr);
  return result.stdout;
}
function psql(sql) { return run(['exec', '-i', db, 'psql', '-X', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql); }
function seedBetween(file, start, end) {
  const source = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error('Missing seed markers: ' + file);
  return source.slice(from, to);
}
function record(name, result) {
  fs.writeFileSync(path.join(evidence, name + '.txt'), result);
  process.stdout.write(result);
}
(async () => {
  try {
    // pg_dump is schema-only. Never use globals/roles dumps (password hashes).
    const schema = run(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--no-privileges']);
    const withAcl = run(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner']);
    const acl = withAcl.split(/(?=^--\n-- Name:)/m).filter(block =>
      /; Type: ACL; Schema: (public|auth|storage|realtime|_realtime);/.test(block)
      || /Name: SCHEMA (public|auth|storage|realtime|_realtime); Type: ACL;/.test(block)).join('\n');
    const roles = run(['exec', source, 'psql', '-X', '-At', '-U', 'postgres', '-d', 'postgres', '-c',
      "select rolname from pg_roles where rolname !~ '^pg_' and rolname <> 'postgres' order by rolname"]).trim().split('\n');
    const metadata = run(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only',
      '--table=_realtime.schema_migrations', '--table=realtime.schema_migrations', '--table=auth.schema_migrations', '--table=storage.migrations', '--no-owner', '--no-privileges']);
    // Record deployment drift, then install only UNCHANGED checkout definitions
    // in the disposable clone so results refer to the requested product baseline.
    const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261008140000_resource_uploads.sql'), 'utf8');
    const baselineFunctions = [], matches = [];
    for (const name of ['resource_guest_snapshot', 'write_resource_guest_moment', 'delete_resource_guest_moment', 'prepare_resource_upload']) {
      const match = migration.match(new RegExp('create function public\\.' + name + '\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;', 'i'));
      if (!match) throw new Error('Missing source definition: ' + name);
      baselineFunctions.push(match[0].replace(/^create function/i, 'create or replace function'));
      const body = run(['exec', source, 'psql', '-X', '-At', '-U', 'postgres', '-d', 'postgres', '-c',
        "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='" + name + "'"]);
      matches.push(name + ': ' + (match[1].trim() === body.trim() ? 'body matches checkout' : 'DEPLOYMENT DRIFT; use unchanged checkout body in clone'));
    }
    record('source-match', matches.join('\n') + '\nSchema-only clone; no user rows copied.\n');
    run(['network', 'create', '--internal', network]); created.push(['network', 'rm', network]);
    run(['run', '-d', '--name', db, '--label', 'kaipa.issue11.disposable=true', '--network', network,
      '--network-alias', 'realtime-dev.supabase-realtime', '--user', 'postgres', '--entrypoint', 'sh', 'supabase/postgres:15.8.1.085', '-c',
      'initdb -D /tmp/issue11-data --auth=trust >/tmp/init.log && exec postgres -D /tmp/issue11-data -c shared_preload_libraries=pg_stat_statements,pg_net -c unix_socket_directories=/tmp' + (followup ? ' -c wal_level=logical' : '')]);
    created.push(['rm', '-f', db]);
    for (let attempt = 0; attempt < 30; attempt++) {
      const ready = spawnSync('docker', ['exec', db, 'pg_isready', '-h', '/tmp', '-U', 'postgres'], { encoding: 'utf8' });
      if (ready.status === 0) break;
      if (attempt === 29) throw new Error('UNVERIFIED: isolated DB did not become ready');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    psql(roles.map(role => 'create role "' + role.replaceAll('"', '""') + '"' +
      (role === 'supabase_admin' ? ' superuser login' : role === 'service_role' ? ' bypassrls' : '') + ';').join('\n'));
    psql(schema); psql(metadata);
    psql(baselineFunctions.join('\n'));
    psql(acl);
    if (repaired) {
      for (const migration of ['20261012170000_upload_ticket_tuning.sql','20261014100000_guest_permission_boundaries.sql','20261014110000_trusted_journey_locations.sql']) {
        psql(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
      }
    }
    psql(seedBetween('20261008120000_membership_foundation.sql', 'insert into public.resource_policies(version, features)', 'update public.resource_policies set published_at=now();')
      + seedBetween('20261008130000_membership_runtime.sql', 'insert into public.resource_rate_rules values', 'create function public.membership_event_context')
      + seedBetween('20261008140000_resource_uploads.sql', 'insert into public.service_budgets(service,daily_units,per_run_units)', '-- Backfill'));
    psql("insert into public.service_budget_usage(service,day,used) values('stored_bytes','2000-01-01',0),('stored_objects','2000-01-01',0);");
    if (followup) {
      const passed = await require('./issue11-http-stack.cjs')({ root, temp, db, network, created, run, psql, record, followup });
      process.exitCode = passed ? 0 : 1;
      return;
    }
    const sqlResult = spawnSync('docker', ['exec', '-i', db, 'psql', '-X', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: fs.readFileSync(path.join(root, 'supabase/tests/issue11-guest-boundaries.sql')), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    record('guest-boundaries', sqlResult.stdout + sqlResult.stderr + 'psql exit=' + sqlResult.status + '\n');
    if (sqlResult.status && !sqlResult.stderr.includes('Issue 11 guest access boundary regression failed')) throw new Error('UNVERIFIED: SQL setup failed');
    let existingFailed = false;
    for (const name of ['journey-passphrase-v2', 'journey-invite-toggle']) {
      const result = spawnSync('docker', ['exec', '-i', db, 'psql', '-X', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: fs.readFileSync(path.join(root, 'supabase/tests', name + '.sql')), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      });
      record(name, result.stdout + result.stderr + 'psql exit=' + result.status + '\n');
      existingFailed ||= result.status !== 0;
    }
    if (repaired) {
      const httpPassed = await require('./issue11-http-stack.cjs')({ root, temp, db, network, created, run, psql, record });
      process.exitCode = sqlResult.status || existingFailed || !httpPassed ? 1 : 0;
      return;
    }
    const fixture = Object.fromEntries(['owner', 'member', 'outsider', 'anonymous', 'journey'].map(key => [key, crypto.randomUUID()]));
    psql("insert into auth.users(id,email,role,aud,is_anonymous) values " + ['owner', 'member', 'outsider', 'anonymous'].map(key =>
      "('" + fixture[key] + "','" + fixture[key] + "@example.test','authenticated','authenticated'," + (key === 'anonymous') + ')').join(',') + ';\n'
      + "insert into public.profiles(id,display_name) select id,'Fixture' from auth.users on conflict(id) do nothing;\n"
      + "insert into public.journeys(id,user_id,name,region,lng,lat,tone) values('" + fixture.journey + "','" + fixture.owner + "','Fixture','Test',110,25,'forest');\n"
      + "insert into public.companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order) values('" + fixture.member + "','" + fixture.journey + "','M','Member','#2E7D5B',false,false,0);\n");
    fs.writeFileSync(path.join(temp, 'presence.json'), JSON.stringify(fixture));
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(path.join(temp, 'runtime.env'), [
      'PORT=4000', 'DB_HOST=localhost', 'DB_PORT=5432', 'DB_USER=supabase_admin', 'DB_PASSWORD=disposable', 'DB_NAME=postgres',
      'DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime', 'DB_ENC_KEY=supabaserealtime', 'API_JWT_SECRET=' + secret,
      'METRICS_JWT_SECRET=' + secret, 'SECRET_KEY_BASE=' + crypto.randomBytes(64).toString('hex'), 'ERL_AFLAGS=-proto_dist inet_tcp',
      "DNS_NODES=''", 'RLIMIT_NOFILE=10000', 'APP_NAME=realtime', 'SEED_SELF_HOST=true', 'RUN_JANITOR=false',
      'SELF_HOST_TENANT_NAME=realtime-dev', 'HOSTNAME=realtime-dev.supabase-realtime',
    ].join('\n'), { mode: 0o600 });
    run(['run', '-d', '--name', realtime, '--label', 'kaipa.issue11.disposable=true', '--network', 'container:' + db,
      '--env-file', path.join(temp, 'runtime.env'), 'supabase/realtime:v2.102.3']); created.push(['rm', '-f', realtime]);
    for (let attempt = 0; attempt < 45; attempt++) {
      // HTTP availability only; the child performs the actual authenticated join.
      const ready = spawnSync('docker', ['exec', realtime, 'curl', '-s', '--max-time', '2', '-o', '/dev/null', 'http://localhost:4000/'], { encoding: 'utf8' });
      if (ready.status === 0) { await new Promise(resolve => setTimeout(resolve, 6000)); break; }
      if (attempt === 44) throw new Error('UNVERIFIED: isolated Realtime did not become ready');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    created.push(['rm', '-f', client]);
    const child = spawn('docker', ['run', '--rm', '-i', '--name', client, '--network', network,
      '-v', fs.realpathSync(path.join(root, 'node_modules')) + ':/deps:ro', '-v', temp + ':/fixture:ro',
      '-v', path.join(root, 'scripts/qa/issue11-presence.cjs') + ':/test.cjs:ro', '-e', 'NODE_PATH=/deps', 'node:22-alpine', 'node', '/test.cjs'],
    { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '', revoked = false;
    child.stdout.on('data', data => {
      output += data;
      if (!revoked && output.includes('REVOKE_READY')) {
        revoked = true;
        try {
          psql("delete from public.companions where journey_id='" + fixture.journey + "' and user_id='" + fixture.member + "';");
          child.stdin.end('revoked\n');
        } catch (error) { errors += error.message; child.kill(); }
      }
    });
    child.stderr.on('data', data => { errors += data; });
    const code = await new Promise(resolve => child.on('close', resolve));
    record('presence-boundaries', output + errors + 'presence exit=' + code + '\n');
    if (code === 2) record('realtime-debug', run(['logs', realtime]));
    if (code !== 0 && code !== 1) throw new Error('UNVERIFIED: presence connection/setup failure');
    process.exitCode = sqlResult.status || code || existingFailed ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
  finally {
    for (const args of created.reverse()) spawnSync('docker', args, { stdio: 'ignore' });
    fs.rmSync(temp, { recursive: true, force: true });
    console.log('Disposable containers/network removed; shared stack was read-only.');
  }
})();
