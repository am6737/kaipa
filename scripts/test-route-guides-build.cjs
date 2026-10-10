const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const script = resolve(__dirname, 'build-route-guides.mjs');
const source = `  - id: s1
    platform: xiaohongshu
    title: 原帖标题
    url: null
    author: null
    observedOn: 2025-11
    retrievedAt: 2026-10-09`;
const valid = `---
routeId: trk014
title: 格聂牧场线
variant: 4天3晚 · 下则通村→则巴村
asOf: 2026-10-09        # 最后核验日期
sources:
${source}
---
## 概览 [s1]
已经核验的概览。

## 交通 [s1]
截至 2026-10-09 的交通说明。
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kaipa-route-guides-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'guides');
  const out = join(root, 'generated', 'route-guides.generated.ts');
  mkdirSync(dir);
  return {
    dir, out,
    write: (name, body) => writeFileSync(join(dir, name), body),
    run: (...args) => spawnSync(process.execPath, [script, '--dir', dir, '--out', out, ...args], {
      encoding: 'utf8', cwd: tmpdir(),
    }),
    text: () => readFileSync(out, 'utf8'),
    data: () => JSON.parse(readFileSync(out, 'utf8').match(/ = ([\s\S]*);\n$/)[1]),
  };
}

function succeeds(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

test('zero guides generates an empty map and passes --check without rewriting', (t) => {
  const f = fixture(t);
  succeeds(f.run());
  assert.deepEqual(f.data(), {});
  assert.match(f.text(), /Generated.*DO NOT EDIT/);
  const original = f.text();
  succeeds(f.run('--check'));
  assert.equal(f.text(), original);
});

test('README, underscore files and subdirectories including _inbox are ignored', (t) => {
  const f = fixture(t);
  for (const name of ['README.md', '_draft.md', 'notes.txt']) f.write(name, 'invalid guide');
  for (const name of ['_inbox', 'nested']) {
    mkdirSync(join(f.dir, name));
    writeFileSync(join(f.dir, name, 'trk014.md'), 'invalid guide');
  }
  f.write('trk014.md', valid);
  succeeds(f.run());
  assert.deepEqual(Object.keys(f.data()), ['trk014']);
});

test('valid contract preserves metadata, source nulls, section bodies and markdown', (t) => {
  const f = fixture(t);
  f.write('trk014.md', valid);
  succeeds(f.run());
  const guide = f.data().trk014;
  assert.equal(guide.routeId, 'trk014');
  assert.equal(guide.title, '格聂牧场线');
  assert.equal(guide.variant, '4天3晚 · 下则通村→则巴村');
  assert.equal(guide.asOf, '2026-10-09');
  assert.deepEqual(guide.sources, [{ id: 's1', platform: 'xiaohongshu', title: '原帖标题',
    url: null, author: null, observedOn: '2025-11', retrievedAt: '2026-10-09' }]);
  assert.deepEqual(guide.sections, [
    { key: 'overview', heading: '概览', sourceIds: ['s1'], body: '已经核验的概览。' },
    { key: 'access', heading: '交通', sourceIds: ['s1'], body: '截至 2026-10-09 的交通说明。' },
  ]);
  assert.equal(guide.markdown, valid.split('---\n')[2].trim());
});

test('deterministic output sorts routes and sections regardless of file creation order', (t) => {
  const a = fixture(t);
  const b = fixture(t);
  const headings = ['概览', '行程', '交通', '住宿与营地', '费用', '补给与水源', '季节与风险', '装备建议', '注意事项'];
  const body = headings.toReversed().map((heading) => `## ${heading} [s1]\n${heading}正文。`).join('\n\n');
  const guide = valid.slice(0, valid.indexOf('## ')) + body;
  for (const id of ['trk015', 'trk014']) a.write(`${id}.md`, guide.replace('routeId: trk014', `routeId: ${id}`));
  for (const id of ['trk014', 'trk015']) b.write(`${id}.md`, guide.replace('routeId: trk014', `routeId: ${id}`));
  succeeds(a.run());
  succeeds(b.run());
  assert.equal(a.text(), b.text());
  const initial = a.text();
  succeeds(a.run());
  assert.equal(a.text(), initial);
  assert.deepEqual(Object.keys(a.data()), ['trk014', 'trk015']);
  assert.deepEqual(a.data().trk014.sections.map((section) => section.heading), headings);
  assert.deepEqual(a.data().trk014.sections.map((section) => section.key),
    ['overview', 'itinerary', 'access', 'overnight', 'costs', 'water_supply', 'season_risk', 'gear', 'tips']);
  assert.equal(a.data().trk014.markdown, body);
});

test('--check fails for missing, stale and corrupt output without modifying it', (t) => {
  const f = fixture(t);
  const missing = f.run('--check');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /generated file is out of date/);
  assert.ok(missing.stderr.includes(f.out));
  succeeds(f.run());
  const original = f.text();
  f.write('trk014.md', valid);
  const stale = f.run('--check');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /generated file is out of date/);
  assert.equal(f.text(), original);
  succeeds(f.run());
  succeeds(f.run('--check'));
  writeFileSync(f.out, f.text() + '\n');
  assert.notEqual(f.run('--check').status, 0);
});

test('quoted values, comments, URL fragments, BOM and CRLF are supported', (t) => {
  const f = fixture(t);
  const input = valid
    .replace('title: 格聂牧场线', 'title: "格聂 # 牧场: 线" # 备注')
    .replace('author: null', "author: '作者''甲 # 乙' # 备注")
    .replace('url: null', 'url: https://example.com/post#trail # 备注')
    .replace('observedOn: 2025-11', 'observedOn: "2024-02-29"')
    .replace('retrievedAt: 2026-10-09', "retrievedAt: '2026-10-09'");
  f.write('trk014.md', '\uFEFF' + input.replaceAll('\n', '\r\n'));
  succeeds(f.run());
  const guide = f.data().trk014;
  assert.equal(guide.title, '格聂 # 牧场: 线');
  assert.equal(guide.sources[0].author, "作者'甲 # 乙");
  assert.equal(guide.sources[0].url, 'https://example.com/post#trail');
  assert.equal(guide.sources[0].observedOn, '2024-02-29');
});

test('optional variant, uncited sections and empty sources are supported', (t) => {
  const f = fixture(t);
  const input = valid.replace(/^variant:.*\n/m, '').replace(`sources:\n${source}`, 'sources: []').replaceAll(' [s1]', '');
  f.write('trk014.md', input);
  succeeds(f.run());
  assert.equal(f.data().trk014.variant, null);
  assert.deepEqual(f.data().trk014.sources, []);
  assert.deepEqual(f.data().trk014.sections[0].sourceIds, []);
});

test('all six source platforms and unknown observation dates are supported', (t) => {
  const f = fixture(t);
  for (const platform of ['xiaohongshu', 'douyin', 'web', 'official', 'firsthand', 'social']) {
    f.write('trk014.md', valid.replace('platform: xiaohongshu', `platform: ${platform}`).replace('observedOn: 2025-11', 'observedOn: null'));
    succeeds(f.run());
    assert.equal(f.data().trk014.sources[0].platform, platform);
    assert.equal(f.data().trk014.sources[0].observedOn, null);
  }
});

test('multiple citations keep their order and do not require every source to be cited', (t) => {
  const f = fixture(t);
  f.write('trk014.md', valid.replace(source, [source, source.replace('id: s1', 'id: s2'), source.replace('id: s1', 'id: s3')].join('\n'))
    .replace('## 概览 [s1]', '## 概览 [s2,s1]'));
  succeeds(f.run());
  assert.deepEqual(f.data().trk014.sections[0].sourceIds, ['s2', 's1']);
  assert.equal(f.data().trk014.sources.length, 3);
});

test('code fences and level-three headings are section body content', (t) => {
  const f = fixture(t);
  const body = '### 子标题\n```md\n## 不是章节 [unknown]\n```\n~~~md\n## 也不是章节\n~~~';
  f.write('trk014.md', valid.replace('已经核验的概览。', body));
  succeeds(f.run());
  assert.equal(f.data().trk014.sections[0].body, body);
});

const invalid = [
  ['routeId mismatches filename', (s) => s.replace('routeId: trk014', 'routeId: trk015'), /routeId.*mismatches filename/],
  ['missing routeId', (s) => s.replace(/^routeId:.*\n/m, ''), /missing or invalid routeId/],
  ['missing title', (s) => s.replace(/^title:.*\n/m, ''), /missing or invalid title/],
  ['empty title', (s) => s.replace('title: 格聂牧场线', 'title: null'), /missing or invalid title/],
  ['missing asOf', (s) => s.replace(/^asOf:.*\n/m, ''), /missing or invalid asOf/],
  ['missing sources', (s) => s.replace(`sources:\n${source}\n`, ''), /missing sources/],
  ['asOf must include day', (s) => s.replace('asOf: 2026-10-09', 'asOf: 2026-10'), /bad date for asOf/],
  ['invalid calendar day', (s) => s.replace('asOf: 2026-10-09', 'asOf: 2026-04-31'), /bad date for asOf/],
  ['invalid leap day', (s) => s.replace('asOf: 2026-10-09', 'asOf: 2025-02-29'), /bad date for asOf/],
  ['invalid observation month', (s) => s.replace('observedOn: 2025-11', 'observedOn: 2025-13'), /bad date.*observedOn/],
  ['invalid observation day', (s) => s.replace('observedOn: 2025-11', 'observedOn: 2025-11-31'), /bad date.*observedOn/],
  ['malformed observation date', (s) => s.replace('observedOn: 2025-11', 'observedOn: yesterday'), /bad date.*observedOn/],
  ['invalid retrieval date', (s) => s.replace('retrievedAt: 2026-10-09', 'retrievedAt: 2026-00-09'), /bad date.*retrievedAt/],
  ['missing retrieval date', (s) => s.replace(/^    retrievedAt:.*\n/m, ''), /bad date.*retrievedAt/],
  ['unknown platform', (s) => s.replace('platform: xiaohongshu', 'platform: youtube'), /unknown platform/],
  ['duplicate source ids', (s) => s.replace(source, `${source}\n${source}`), /duplicate source id: s1/],
  ['undefined citation', (s) => s.replace('## 交通 [s1]', '## 交通 [s1,s2]'), /交通 cites undefined source id: s2/],
  ['unknown heading', (s) => s.replace('## 交通 [s1]', '## 餐饮 [s1]'), /unknown heading: 餐饮/],
  ['empty section', (s) => s.replace('已经核验的概览。', '  \n'), /empty section body: 概览/],
  ['empty final section', (s) => s.replace('截至 2026-10-09 的交通说明。', ''), /empty section body: 交通/],
  ['duplicate section', (s) => s.replace('## 交通 [s1]', '## 概览 [s1]'), /duplicate section heading/],
  ['invalid source URL', (s) => s.replace('url: null', 'url: not-a-url'), /invalid URL/],
  ['missing source title', (s) => s.replace('    title: 原帖标题\n', ''), /missing or invalid source s1 title/],
  ['missing nullable field', (s) => s.replace('    observedOn: 2025-11\n', ''), /missing source s1 observedOn/],
  ['missing frontmatter', (s) => s.replace(/^---\n/, ''), /missing YAML frontmatter opening/],
  ['unterminated frontmatter', (s) => s.replace('\n---\n', '\n'), /missing YAML frontmatter closing/],
  ['duplicate metadata', (s) => s.replace('title: 格聂牧场线', 'title: 格聂牧场线\ntitle: 重复'), /duplicate frontmatter field/],
  ['unsupported YAML', (s) => s.replace('title: 格聂牧场线', 'title: |\n  多行'), /unsupported YAML value/],
  ['malformed quotes', (s) => s.replace('title: 格聂牧场线', 'title: "未结束'), /unterminated quoted/],
];

for (const [name, mutate, reason] of invalid) {
  test(`rejects ${name} with filename and reason; leaves existing output intact`, (t) => {
    const f = fixture(t);
    succeeds(f.run());
    const original = f.text();
    f.write('trk014.md', mutate(valid));
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(join(f.dir, 'trk014.md')), result.stderr);
    assert.match(result.stderr, reason);
    assert.equal(f.text(), original);
  });
}

test('validates every file and reports all file errors together', (t) => {
  const f = fixture(t);
  f.write('trk014.md', valid.replace('title: 格聂牧场线', 'title: null'));
  f.write('trk015.md', valid.replace('routeId: trk014', 'routeId: trk015').replace('## 交通 [s1]', '## 餐饮'));
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trk014\.md: missing or invalid title/);
  assert.match(result.stderr, /trk015\.md: unknown heading: 餐饮/);
});

test('unknown CLI arguments and missing override paths fail clearly', (t) => {
  const f = fixture(t);
  for (const [args, reason] of [[['--unknown'], /unknown argument/], [['--dir'], /--dir requires a path/],
    [['--out', '--check'], /--out requires a path/]]) {
    const result = f.run(...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, reason);
  }
});
