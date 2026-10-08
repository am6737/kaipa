const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const files=['20261008120000_membership_foundation.sql','20261008130000_membership_runtime.sql','20261008140000_resource_uploads.sql'];
const markers=['membership_runtime','resource_rate_rules','resource_upload_tickets'];
const installed=spawnSync('docker',['exec','kaipa-supabase-db','psql','-X','-At','-U','postgres','-d','postgres','-c',markers.map(t=>"select to_regclass('public."+t+"') is not null;").join('')],{encoding:'utf8'});
if(installed.status!==0) throw new Error('Unable to inspect self-hosted database');
const flags=installed.stdout.trim().split('\n');
const migrations=[...files.filter((_,i)=>flags[i]!=='t'),'20261008150000_resource_maintenance_fix.sql'].map(f=>fs.readFileSync('supabase/migrations/'+f,'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'')).join('\n');
const tests=fs.readFileSync('supabase/tests/membership-runtime.sql','utf8');
const result=spawnSync('docker',['exec','-i','kaipa-supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],{input:'begin;\n'+migrations+'\n'+tests+'\nrollback;',encoding:'utf8',maxBuffer:8*1024*1024});
if(result.status!==0){process.stderr.write(result.stderr || result.stdout);process.exit(result.status || 1);}
console.log('Runtime upload accounting, storage RLS, guest isolation, AI settlement, global budgets, transitions and admin authorization passed; all fixtures rolled back.');
