const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual Edge Function handler with an in-memory Supabase client.
// No credentials, network calls, or live records are involved.
const code = ts.transpileModule(readFileSync(`${__dirname}/index.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function request({ status = 'archived', role = 'editor', restoreDuringDelete = false, failDelete = false } = {}) {
  let row = status ? { id: 'fact-1', status } : null;
  const audit = [];
  let deleteAttempts = 0;
  const service = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor-1', app_metadata: { role } } } }) },
    from(table) {
      if (table === 'admin_audit_logs') return { insert: async (entry) => { audit.push(entry); return { error: null }; } };
      assert.equal(table, 'route_fact_entries');
      const filters = {};
      let deleting = false;
      const query = {
        delete() { deleting = true; deleteAttempts++; return query; },
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          if (deleting && failDelete) return { error: new Error('database unavailable') };
          if (deleting && restoreDuringDelete && row) row.status = 'confirmed';
          const matched = row && Object.entries(filters).every(([key, value]) => row[key] === value);
          const data = matched ? { id: row.id } : null;
          if (deleting && matched) row = null;
          return { data, error: null };
        },
      };
      return query;
    },
  };
  let handler;
  vm.runInNewContext(code, {
    exports: {}, Request, Response, URL,
    console: { error() {} },
    require: (name) => {
      assert.equal(name, 'npm:@supabase/supabase-js@2.108.1');
      return { createClient: () => service };
    },
    Deno: { env: { get: () => 'test-placeholder' }, serve: (value) => { handler = value; } },
  });
  const response = await handler(new Request('https://example.test?resource=routeFacts', {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete-route-fact', id: 'fact-1' }),
  }));
  return { response, row, audit, deleteAttempts };
}

test('deletes an archived fact and records the actor and target in the admin audit log', async () => {
  const result = await request();
  assert.equal(result.response.status, 200);
  assert.equal(result.row, null);
  assert.equal(result.audit.length, 1);
  assert.equal(result.audit[0].actor_id, 'actor-1');
  assert.equal(result.audit[0].resource_id, 'fact-1');
  assert.equal(result.audit[0].action, 'delete-route-fact');
});

for (const status of ['confirmed', 'suggested']) {
  test(`rejects deletion of a ${status} fact`, async () => {
    const result = await request({ status });
    assert.equal(result.response.status, 409);
    assert.equal(result.row.status, status);
    assert.equal(result.audit.length, 0);
  });
}

test('does not delete a fact restored concurrently', async () => {
  const result = await request({ restoreDuringDelete: true });
  assert.equal(result.response.status, 409);
  assert.equal(result.row.status, 'confirmed');
});

test('returns 404 for an absent fact', async () => {
  assert.equal((await request({ status: null })).response.status, 404);
});

test('viewers cannot delete facts', async () => {
  const result = await request({ role: 'viewer' });
  assert.equal(result.response.status, 403);
  assert.equal(result.deleteAttempts, 0);
  assert.equal(result.row.status, 'archived');
});

test('reports database errors without recording successful deletion', async () => {
  const result = await request({ failDelete: true });
  assert.equal(result.response.status, 500);
  assert.equal(result.row.status, 'archived');
  assert.equal(result.audit.length, 0);
});
