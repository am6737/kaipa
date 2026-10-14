// Called only by the disposable harness. No shared keys/configuration are read.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
module.exports = async ({
  root,
  temp,
  db,
  network,
  created,
  run,
  psql,
  record,
}) => {
  const secret = crypto.randomBytes(32).toString('hex');
  const jwt = (role, sub, anonymous = false) => {
    const enc = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
    const data =
      enc({ alg: 'HS256', typ: 'JWT' }) +
      '.' +
      enc({
        role,
        sub,
        aud: 'authenticated',
        is_anonymous: anonymous,
        exp: Math.floor(Date.now() / 1000) + (sub === 'expired' ? -60 : 3600),
      });
    return (
      data +
      '.' +
      crypto.createHmac('sha256', secret).update(data).digest('base64url')
    );
  };
  const fixture = Object.fromEntries(
    ['owner', 'member', 'outsider', 'anonymous', 'journey'].map((x) => [
      x,
      crypto.randomUUID(),
    ]),
  );
  fixture.tokens = Object.fromEntries(
    ['owner', 'member', 'outsider', 'anonymous'].map((x) => [
      x,
      jwt('authenticated', fixture[x], x === 'anonymous'),
    ]),
  );
  fixture.expiredToken = jwt('authenticated', 'expired');
  fixture.anonKey = jwt('anon');
  fixture.serviceKey = jwt('service_role');
  psql(
    'alter role authenticator login; alter role supabase_auth_admin login superuser; alter role supabase_auth_admin set search_path=auth; alter role supabase_storage_admin login superuser;\n' +
      'grant anon,authenticated,service_role to authenticator;\n' +
      'insert into auth.users(id,email,role,aud,is_anonymous,created_at,updated_at,instance_id,confirmation_token,email_change,email_change_token_new,recovery_token) values ' +
      ['owner', 'member', 'outsider', 'anonymous']
        .map(
          (x) =>
            "('" +
            fixture[x] +
            "','" +
            fixture[x] +
            "@example.test','authenticated','authenticated'," +
            (x === 'anonymous') +
            ",now(),now(),'00000000-0000-0000-0000-000000000000','','','','')",
        )
        .join(',') +
      ';\n' +
      "insert into public.profiles(id,display_name) select id,'Fixture' from auth.users on conflict do nothing;\n" +
      "insert into public.journeys(id,user_id,name,region,lng,lat,tone) values('" +
      fixture.journey +
      "','" +
      fixture.owner +
      "','Fixture','Test',110,25,'forest');\n" +
      "insert into public.companions(user_id,journey_id,ini,name,color,is_host,is_self,sort_order) values('" +
      fixture.member +
      "','" +
      fixture.journey +
      "','M','Member','#2E7D5B',false,false,0);\n" +
      "insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shared-moments','shared-moments',true,26214400,array['image/jpeg']) on conflict do nothing;\n",
  );
  fs.writeFileSync(
    path.join(temp, 'http-fixture.json'),
    JSON.stringify(fixture),
    { mode: 0o600 },
  );
  const launch = (suffix, image, env, args = []) => {
    const name = db + '-' + suffix;
    const file = path.join(temp, suffix + '.env');
    fs.writeFileSync(
      file,
      Object.entries(env)
        .map(([k, v]) => k + '=' + v)
        .join('\n'),
      { mode: 0o600 },
    );
    run([
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'kaipa.issue11.disposable=true',
      '--network',
      'container:' + db,
      '--env-file',
      file,
      ...args,
      image,
    ]);
    created.push(['rm', '-f', name]);
    return name;
  };
  const rest = launch('rest', 'postgrest/postgrest:v14.12', {
    PGRST_DB_URI: 'postgres://authenticator:disposable@localhost:5432/postgres',
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: secret,
  });
  const auth = launch('auth', 'supabase/gotrue:v2.189.0', {
    GOTRUE_API_HOST: '0.0.0.0',
    GOTRUE_API_PORT: 9999,
    API_EXTERNAL_URL: 'http://localhost:8080',
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL:
      'postgres://supabase_auth_admin:disposable@localhost:5432/postgres',
    GOTRUE_SITE_URL: 'http://localhost:8080',
    GOTRUE_JWT_SECRET: secret,
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
  });
  const storage = launch('storage', 'supabase/storage-api:v1.60.4', {
    ANON_KEY: fixture.anonKey,
    SERVICE_KEY: fixture.serviceKey,
    POSTGREST_URL: 'http://localhost:3000',
    AUTH_JWT_SECRET: secret,
    DATABASE_URL:
      'postgres://supabase_storage_admin:disposable@localhost:5432/postgres',
    STORAGE_PUBLIC_URL: 'http://localhost:8080',
    STORAGE_BACKEND: 'file',
    FILE_STORAGE_BACKEND_PATH: '/tmp/storage',
    GLOBAL_S3_BUCKET: 'fixture',
    TENANT_ID: 'fixture',
    REGION: 'local',
    FILE_SIZE_LIMIT: 26214400,
    ENABLE_IMAGE_TRANSFORMATION: false,
  });
  // Actual resources index runs in its own HTTP worker, unchanged.
  const denoEnv = {
    DENO_DIR: '/deno-cache',
    SUPABASE_URL: 'http://localhost:8080',
    SUPABASE_ANON_KEY: fixture.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.serviceKey,
  };
  const denoArgs = [
    '--entrypoint',
    '/deno',
    '-v',
    '/home/coder/.deno/bin/deno:/deno:ro',
    '-v',
    '/home/coder/.cache/deno:/deno-cache',
    '-v',
    root + ':/repo:ro',
    '-v',
    temp + ':/fixture:ro',
  ];
  const launchDeno = (suffix, file) => {
    const name = db + '-' + suffix,
      envfile = path.join(temp, suffix + '.env');
    fs.writeFileSync(
      envfile,
      Object.entries(denoEnv)
        .map(([k, v]) => k + '=' + v)
        .join('\n'),
      { mode: 0o600 },
    );
    run([
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'kaipa.issue11.disposable=true',
      '--network',
      'container:' + db,
      '--env-file',
      envfile,
      ...denoArgs,
      'supabase/postgres:15.8.1.085',
      'run',
      '--allow-all',
      file,
    ]);
    created.push(['rm', '-f', name]);
    return name;
  };
  const resources = launchDeno(
    'resources',
    '/repo/supabase/functions/resources/index.ts',
  );
  fs.writeFileSync(
    path.join(temp, 'gateway.ts'),
    `import { handleLocation } from '/repo/supabase/functions/journey-location/handler.ts';
import { realtimeGuard } from '/repo/supabase/functions/realtime-location-guard/server.ts';
const guard = realtimeGuard('http://realtime-dev.supabase-realtime:4000', path => path.replace('/realtime/v1','/socket'));
Deno.serve({port:8080},async req=>{
const u=new URL(req.url);
if(u.pathname==='/functions/v1/journey-location') return handleLocation(req);
if(u.pathname.startsWith('/realtime/v1/')) return guard(req);
if(u.pathname.startsWith('/socket/')||u.pathname==='/api/broadcast') return guard(req);
const routes=[['/auth/v1',9999],['/rest/v1',3000],['/storage/v1',5000],['/functions/v1/resources',8000]];
const r=routes.find(([prefix])=>u.pathname.startsWith(String(prefix)));
if(!r)return new Response('not found',{status:404});
u.port=String(r[1]);u.pathname=u.pathname.slice(String(r[0]).length)||'/';
try{return await fetch(u,{method:req.method,headers:req.headers,body:req.body,redirect:'manual'});}catch{return new Response('upstream unavailable',{status:503});}
});`,
  );
  const gateway = launchDeno('gateway', '/fixture/gateway.ts');
  // Realtime is isolated too; no shared tenant settings or JWT secrets copied.
  const realtime = launch('realtime', 'supabase/realtime:v2.102.3', {
    PORT: 4000,
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USER: 'supabase_admin',
    DB_PASSWORD: 'disposable',
    DB_NAME: 'postgres',
    DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime',
    DB_ENC_KEY: 'supabaserealtime',
    API_JWT_SECRET: secret,
    METRICS_JWT_SECRET: secret,
    SECRET_KEY_BASE: crypto.randomBytes(64).toString('hex'),
    ERL_AFLAGS: '-proto_dist inet_tcp',
    DNS_NODES: "''",
    RLIMIT_NOFILE: 10000,
    APP_NAME: 'realtime',
    SEED_SELF_HOST: true,
    RUN_JANITOR: false,
    SELF_HOST_TENANT_NAME: 'realtime-dev',
    HOSTNAME: 'realtime-dev.supabase-realtime',
  });
  const clientName = db + '-http-client';
  created.push(['rm', '-f', clientName]);
  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--name',
      clientName,
      '--network',
      'container:' + db,
      '-v',
      fs.realpathSync(path.join(root, 'node_modules')) + ':/deps:ro',
      '-v',
      temp + ':/fixture:ro',
      '-v',
      path.join(root, 'scripts/qa/issue11-http.cjs') + ':/test.cjs:ro',
      '-e',
      'NODE_PATH=/deps',
      'node:22-alpine',
      'node',
      '/test.cjs',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let output = '',
    errors = '',
    buffer = '';
  child.stdout.on('data', (data) => {
    output += data;
    buffer += data;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.startsWith('SQL ')) {
        try {
          const { id, sql } = JSON.parse(line.slice(4));
          const result =
            sql === 'DRAIN_ISOLATED_REALTIME'
              ? run(['restart', '--time', '1', realtime])
              : psql(sql);
          child.stdin.write(JSON.stringify({ id, result }) + '\n');
        } catch (error) {
          errors += error.message;
          child.kill();
        }
      }
    }
  });
  child.stderr.on('data', (data) => (errors += data));
  child.stdin.on('error', (error) => {
    errors += error.message;
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  record(
    'http-boundaries',
    output
      .split('\n')
      .filter((l) => !l.startsWith('SQL '))
      .join('\n') +
      errors +
      'http exit=' +
      code +
      '\n',
  );
  if (code) {
    for (const [name, container] of Object.entries({
      rest,
      auth,
      storage,
      resources,
      gateway,
      realtime,
    })) {
      // Redact all fixture JWTs/secrets even though they are disposable.
      let logs = run(['logs', container]);
      for (const value of [
        secret,
        fixture.anonKey,
        fixture.serviceKey,
        ...Object.values(fixture.tokens),
      ])
        logs = logs.replaceAll(value, '[fixture credential]');
      fs.writeFileSync(path.join(temp, name + '-debug.txt'), logs);
      record(name + '-debug', logs.slice(-8000));
    }
    if (code === 1) return false;
    throw new Error('UNVERIFIED: HTTP integration exit ' + code);
  }
  return true;
};
