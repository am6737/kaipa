import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGuide, splitGuide } from './import-route-guides.mjs';
test('parser splits a temp fixture and keeps only cited sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaipa-route-guide-'));
  try {
    const path = join(dir, 'fixture.md');
    await writeFile(path, `---\nrouteId: fixture\ntitle: 测试\nasOf: 2026-10-10\nsources:\n  - id: a\n    platform: web\n    title: 页面\n    url: https://example.com\n    author: null\n    observedOn: null\n    retrievedAt: 2026-10-10\n  - id: b\n    platform: firsthand\n    title: 队员记录\n    url: null\n    author: null\n    observedOn: null\n    retrievedAt: 2026-10-10\n---\n## 概览 [a]\n概览正文\n## 交通 [b]\n交通正文`);
    const guide = parseGuide(await readFile(path, 'utf8'), path);
    const rows = splitGuide(guide);
    assert.deepEqual(rows.map(row => row.section), ['overview', 'access']);
    assert.deepEqual(rows[0].sources.map(source => source.id), ['a']);
    assert.deepEqual(rows[1].sources.map(source => source.id), ['b']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
