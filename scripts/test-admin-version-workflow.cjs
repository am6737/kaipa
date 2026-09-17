const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(process.env.ADMIN_MOCK_URL || 'http://localhost:8092/admin-preview.html');
    const button = name => page.getByRole('button', { name, exact: true });
    const close = () => button('关闭详情').click();
    const versions = async name => {
      await button(name).click();
      await button('发布与版本').click();
    };
    for (const [module, name] of [['路线资源', '武功山经典穿越'], ['公共装备库', '轻量徒步背包 40L'], ['清单模板', '单日轻徒步']]) {
      await page.getByRole('navigation', { name: '后台导航' }).getByRole('button', { name: new RegExp(`^${module}`) }).click();
      await button(name).click();
      await button('编辑草稿').click();
      await page.getByLabel(/^名称/).fill(`${name}修订`);
      await button('保存修改').click();
      assert.match(await page.locator('tbody tr').filter({ hasText: name }).innerText(), /待发布草稿/);
      assert.equal(await button(`${name}修订`).count(), 0);
      await versions(name);
      assert.match(await page.locator('.version-diff').innerText(), /修订/);
      if (module === '路线资源') {
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const theme of ['light', 'dark']) {
            if (theme === 'dark') {
              await close();
              await button('切换主题').click();
              await versions(name);
            }
            await page.screenshot({ path: `/tmp/kaipa-admin-versions-${width}-${theme}.png` });
            assert.equal(await page.locator('.drawer').evaluate(el => el.scrollWidth === el.clientWidth), true);
          }
          await close();
          await button('切换主题').click();
          await versions(name);
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await button('发布草稿').click();
      assert.equal(await button('确认发布').isDisabled(), true);
      await page.getByLabel('发布说明').fill('修订资源信息');
      await button('确认发布').click();
      assert.match(await page.locator('.release-summary').innerText(), /v2/);
      await page.locator('.version-list button').filter({ hasText: '初始发布版本' }).click();
      await button('回滚到 v1').click();
      await page.getByLabel('操作原因').fill('恢复原始内容');
      await button('确认回滚').click();
      assert.match(await page.locator('.release-summary').innerText(), /v3/);
      assert.equal(await page.locator('.version-list button').count(), 3);
      await button('创建修订草稿').click();
      await page.getByLabel(/^名称/).fill(`${name}待放弃`);
      await button('保存修改').click();
      await versions(name);
      await page.getByRole('group', { name: '版本视图' }).getByRole('button', { name: /发布历史/ }).click();
      await page.locator('.version-list button').filter({ hasText: '初始发布版本' }).click();
      assert.equal(await button('回滚到 v1').isDisabled(), true);
      await page.getByRole('group', { name: '版本视图' }).getByRole('button', { name: '待发布草稿' }).click();
      await button('放弃草稿').click();
      await page.getByLabel('操作原因').fill('取消本次修订');
      await button('确认放弃草稿').click();
      await close();
      await button(name).click();
      await button('下架').click();
      await page.getByLabel('处理原因').fill('临时下架');
      await button('确认下架').click();
      await versions(name);
      await button('重新上架').click();
      await page.getByLabel('操作原因').fill('恢复展示');
      await button('确认重新上架').click();
      assert.match(await page.locator('.release-summary').innerText(), /已发布[\s\S]*v3/);
      assert.equal(await page.locator('.version-list button').count(), 3);
      await close();
    }
    assert.deepEqual(errors, []);
    assert.equal(requests.some(request => /\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(request)), false);
    console.log('PASS: all three resource types, isolated drafts, publish v2, rollback v3, discard, unpublish/re-list, light/dark/mobile, no backend calls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
