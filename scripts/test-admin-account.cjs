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
    const tab = name => page.getByRole('tab', { name, exact: true });
    const nav = async name => {
      await page.getByRole('navigation', { name: '后台导航' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
    };
    await button('我的账户').click();
    await page.getByLabel('显示名称').fill('');
    assert.equal(await button('保存个人资料').isDisabled(), true);
    await page.getByLabel('显示名称').fill('测试管理员');
    page.once('dialog', dialog => dialog.dismiss());
    await button('关闭详情').click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await button('保存个人资料').click();
    assert.match(await page.locator('.account-identity').innerText(), /测试管理员/);
    await tab('账户安全').click();
    await button('模拟重置密码').click();
    await button('确认模拟重置密码').click();
    assert.equal(await button('模拟重置密码').isDisabled(), true);
    await page.getByRole('switch', { name: '模拟双重验证' }).click();
    await button('取消').click();
    assert.equal(await page.getByRole('switch', { name: '模拟双重验证' }).getAttribute('aria-checked'), 'false');
    await page.getByRole('switch', { name: '模拟双重验证' }).click();
    await button('确认模拟开启双重验证').click();
    assert.equal(await page.getByRole('switch', { name: '模拟双重验证' }).getAttribute('aria-checked'), 'true');
    await button('撤销会话').click();
    await button('确认撤销其他会话').click();
    assert.equal(await button('撤销会话').count(), 0);
    await tab('偏好设置').click();
    await page.getByRole('switch', { name: '紧凑列表' }).click();
    await page.getByLabel('默认每页条数').selectOption('5');
    await button('深色').click();
    await tab('账户安全').click();
    await page.screenshot({ path: '/tmp/kaipa-admin-account-desktop-dark.png' });
    await button('关闭详情').click();
    await nav('管理员');
    assert.equal(await button('测试管理员').count(), 1);
    assert.equal(await page.getByLabel('每页条数').inputValue(), '5');
    assert.equal(await page.locator('.table-section').evaluate(el => el.classList.contains('compact')), true);
    await button('账户设置').click();
    await tab('账户安全').click();
    assert.equal(await page.getByRole('switch', { name: '模拟双重验证' }).getAttribute('aria-checked'), 'true');
    await tab('偏好设置').click();
    await button('浅色').click();
    await tab('个人资料').click();
    await page.screenshot({ path: '/tmp/kaipa-admin-account-desktop-light.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['浅色', '深色']) {
      await tab('偏好设置').click();
      await button(theme).click();
      for (const name of ['个人资料', '账户安全', '偏好设置']) {
        await tab(name).click();
        assert.equal(await page.locator('.drawer').evaluate(el => el.scrollWidth === el.clientWidth), true);
        await page.screenshot({ path: `/tmp/kaipa-admin-account-mobile-${theme}-${name}.png` });
      }
    }
    await button('退出登录').click();
    await button('确认退出登录').click();
    await page.getByRole('heading', { name: '已退出模拟会话' }).waitFor();
    assert.equal(await page.getByRole('navigation').count(), 0);
    await button('以 测试管理员 进入演示').click();
    await button('账户设置').click();
    assert.equal(await page.getByLabel('显示名称').inputValue(), '测试管理员');
    await button('关闭详情').click();
    assert.equal(await page.locator('.admin').evaluate(el => el.scrollWidth === el.clientWidth), true);
    await page.screenshot({ path: '/tmp/kaipa-admin-account-mobile-shell.png' });
    await button('打开导航').click();
    await button('我的账户').click();
    await button('关闭详情').click();
    await button('重置模拟数据').click();
    await button('确认重置').click();
    await button('账户设置').click();
    assert.equal(await page.getByLabel('显示名称').inputValue(), 'Kaipa Admin');
    await tab('账户安全').click();
    assert.equal(await page.getByRole('switch', { name: '模拟双重验证' }).getAttribute('aria-checked'), 'false');
    await tab('偏好设置').click();
    assert.equal(await page.getByLabel('默认每页条数').inputValue(), '10');
    await button('浅色').click();
    assert.deepEqual(errors, []);
    assert.equal(requests.some(request => /\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(request)), false);
    console.log('PASS: account entry, profile validation/dirty guard/sync, mock security confirmations/session removal, applied preferences, logout/re-entry, reset, desktop/mobile light/dark, no backend calls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
