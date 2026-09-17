const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/app-agent/index.ts'), 'utf8');
const branch = source.match(/: call\.tool_name === 'set_itinerary_group_endpoints'\s*\? (\{ coverage:[\s\S]+?\} \})\s*: /);
assert.ok(branch, 'Progress payload must retain endpoint coverage for taskOutcome');
// Exercise the actual small projection without importing the HTTP server entrypoint.
const project = new Function('call', `return (${branch[1]});`);
assert.deepEqual(project({ output: { coverage: { groupCount: 5, requiredGroupCount: 7, reachesTrackEnd: true }, privateField: 'not public' } }),
  { coverage: { groupCount: 5, requiredGroupCount: 7, reachesTrackEnd: true } });
assert.deepEqual(project({ output: null }), { coverage: { groupCount: 0, requiredGroupCount: 0, reachesTrackEnd: false } });
console.log('Endpoint coverage survives progress projection without exposing full tool receipts.');
