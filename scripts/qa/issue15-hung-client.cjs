// Real exported client + native IndexedDB, controlled HTTP responses only.
// No Supabase/database writes; never print auth headers or tokens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const { chromium } = require('/tmp/kaipa-qa-tools/node_modules/playwright');
const web = '/tmp/kaipa-issue15/review-2/web';
const evidence = { kind: 'browser-native-storage-controlled-http', requests: [], cases: [], pageErrors: [] };
const rows = new Map();
let mode = 'hang', held = [], browser, server, addObserved;
const snapshot = () => ({ sessionId: 'browser-session', share: { id: 'browser-share', journey_id: 'qa', user_id: 'host' },
  journey: { name: 'QA 悬挂恢复', region: 'QA', tone: 'forest', date: null, days: '1', total_days: 1, coverUrl: null },
  host: { display_name: 'Host', avatar_ini: 'H', avatar_color: 'forest' }, companions: [], moments: [...rows.values()], media: [] });
async function join(page, origin) {
  await page.goto(origin + '/j/A1B2');
  await page.getByText('QA 悬挂恢复', { exact: true }).waitFor();
  await page.getByPlaceholder('你的名字').fill('Browser Guest');
  await page.getByText(/^(加入这段旅程|进入旅程)$/).click();
  await page.getByText('添加', { exact: true }).waitFor();
}
function observeAdd() { return new Promise(resolve => { addObserved = resolve; }); }
(async () => {
  try {
    evidence.sourceHashes = Object.fromEntries(['guestDeadline.ts', 'guestRetryState.ts', 'useGuestData.ts', 'guestResources.ts', 'guestStorage.ts', 'GuestWall.tsx', 'GuestUploadSheet.tsx'].map(file =>
      [file, createHash('sha256').update(fs.readFileSync('src/web/' + file)).digest('hex')]));
    evidence.bundleHashes = Object.fromEntries(fs.readdirSync(web + '/_expo/static/js/web').map(file =>
      [file, createHash('sha256').update(fs.readFileSync(web + '/_expo/static/js/web/' + file)).digest('hex')]));
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const module = pathname === '/guestRetryState.js' ? 'guestRetryState' : pathname === '/guestDeadline' ? 'guestDeadline' : null;
      if (module) {
        res.setHeader('content-type', 'text/javascript');
        return res.end(ts.transpileModule(fs.readFileSync('src/web/' + module + '.ts', 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText);
      }
      const file = path.resolve(web, '.' + (pathname.includes('.') ? pathname : '/index.html'));
      if (!file.startsWith(web + path.sep)) return res.writeHead(403).end();
      try { res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(file)); }
      catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath: '/home/coder/.cache/ms-playwright/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
    evidence.chromium = browser.version();
    const page = await browser.newPage({ locale: 'zh-CN' });
    page.on('pageerror', error => evidence.pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
      if (url.pathname !== '/functions/v1/resources') return route.continue();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': '*' } });
      const body = request.postDataJSON();
      const json = value => route.fulfill({ status: 200, contentType: 'application/json', json: value, headers: { 'access-control-allow-origin': '*' } });
      if (body.action === 'guest_open') return json({ sessionId: 'browser-session', token: 'controlled-guest-token' });
      if (body.action === 'guest_snapshot') return json(snapshot());
      assert.equal(body.action, 'guest_add');
      if (!rows.has(body.requestKey)) rows.set(body.requestKey, { ...body.moment, id: 'row-' + rows.size, share_id: 'browser-share', guest_session_id: 'browser-session', created_at: new Date().toISOString() });
      const result = rows.get(body.requestKey);
      evidence.requests.push({ key: body.requestKey, id: result.id, caption: result.caption, mode });
      addObserved?.(); addObserved = null;
      if (mode === 'hang') { held.push({ route, result }); return; }
      return json(result);
    });
    await join(page, origin);
    await page.clock.install();
    await page.getByText('添加', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').fill('悬挂草稿');
    const observed = observeAdd();
    await page.getByText('发布', { exact: true }).click(); await observed;
    const originalKey = evidence.requests.at(-1).key;
    await page.clock.fastForward(30001);
    await page.getByText('等待超过30秒，结果未确认，请重试本次内容', { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('说点什么…（没有照片也可以发布）').inputValue(), '悬挂草稿');
    assert.equal(await page.getByText('取消', { exact: true }).count(), 1);
    evidence.cases.push({ name: 'hung-request-bounded', advancedClockMs: 30001, draftRetained: true, key: originalKey, passed: true });
    mode = 'success';
    await page.getByText('发布', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').waitFor({ state: 'detached' });
    assert.equal(evidence.requests.at(-1).key, originalKey);
    assert.equal(rows.size, 1);
    await page.getByText('添加', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').fill('新操作草稿');
    await held.shift().route.fulfill({ status: 200, contentType: 'application/json', json: rows.get(originalKey), headers: { 'access-control-allow-origin': '*' } });
    await page.clock.runFor(50);
    assert.equal(await page.getByPlaceholder('说点什么…（没有照片也可以发布）').inputValue(), '新操作草稿');
    evidence.cases.push({ name: 'same-key-retry-and-late-response', modelRows: rows.size, newSheetIntact: true, passed: true });
    await page.getByText('取消', { exact: true }).click();
    mode = 'hang';
    await page.getByText('添加', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').fill('刷新恢复');
    const nextObserved = observeAdd();
    await page.getByText('发布', { exact: true }).click(); await nextObserved;
    const reloadKey = evidence.requests.at(-1).key;
    assert.notEqual(reloadKey, originalKey);
    await join(page, origin); // Departure while still pending, without awaiting timeout.
    await page.getByText('添加', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').waitFor();
    await page.waitForFunction(() => document.querySelector('input[placeholder="说点什么…（没有照片也可以发布）"]')?.value === '刷新恢复');
    mode = 'success';
    await page.getByText('发布', { exact: true }).click();
    await page.getByPlaceholder('说点什么…（没有照片也可以发布）').waitFor({ state: 'detached' });
    assert.equal(evidence.requests.at(-1).key, reloadKey);
    assert.equal(rows.size, 2);
    evidence.cases.push({ name: 'departure-reload-resumes-original-key', key: reloadKey, modelRows: rows.size, passed: true });
    await page.evaluate(async () => {
      const state = await import('/guestRetryState.js');
      const uri = await state.durablePhotoUri(URL.createObjectURL(new Blob(['durable-photo'], { type: 'image/png' })));
      if (!uri.startsWith('data:image/png;base64,')) throw new Error('Photo is not durable');
      await state.saveGuestDraft('photo-scope', { key: 'photo-key', picks: [{ uri, width: 1, height: 1 }], caption: '照片草稿', day: 1 });
      await state.saveGuestDraft('photo-scope', { key: 'new-key', picks: [], caption: '新草稿', day: 1 });
      await state.clearGuestDraft('photo-scope', 'new-key');
    });
    await page.reload();
    const native = await page.evaluate(async () => {
      const state = await import('/guestRetryState.js');
      const draft = await state.loadGuestDraft('photo-scope');
      if (draft.key !== 'photo-key' || await (await fetch(draft.picks[0].uri)).text() !== 'durable-photo') throw new Error('Photo/key lost on reload');
      await state.clearGuestDraft('photo-scope', 'photo-key');
      const result = { key: draft.key, caption: draft.caption, photoReadableAfterReload: true, cleared: await state.loadGuestDraft('photo-scope') === null };
      return result;
    });
    assert.equal(native.cleared, true);
    evidence.cases.push({ name: 'native-indexeddb-photo-and-isolated-cleanup', ...native, passed: true });
    assert.deepEqual(evidence.pageErrors, []);
    evidence.passed = true;
  } catch (error) { evidence.failure = error.message; evidence.passed = false; }
  finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync('docs/qa/evidence/issue-15/review-2/hung-client.json', JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ passed: evidence.passed, cases: evidence.cases, failure: evidence.failure, pageErrors: evidence.pageErrors }, null, 2));
    process.exitCode = evidence.passed ? 0 : 1;
  }
})();
