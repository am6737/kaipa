import fs from 'node:fs';

const failures = [];
const privacy = fs.readFileSync(new URL('../PRIVACY.md', import.meta.url), 'utf8');
if (/待填写|待补充|待确认/.test(privacy)) {
  failures.push('PRIVACY.md still contains publication placeholders');
}
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) failures.push('EXPO_PUBLIC_SUPABASE_URL is missing');
if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) failures.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');
if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  failures.push('service-role credentials must never be present in the app environment');
}

if (failures.length) {
  console.error('Release checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Release checks passed.');
