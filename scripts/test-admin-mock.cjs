const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.ADMIN_MOCK_URL || 'http://localhost:8092/admin-preview.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(url);
    await page.getByRole('heading', { name: '数据概览', exact: true }).waitFor();
    const nav = async name => {
      await page.getByRole('navigation', { name: '后台导航' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
    };
    const close = () => page.getByRole('button', { name: '关闭详情', exact: true }).click();
    for (const name of ['用户管理', '行程管理', '路线资源', '公共装备库', '清单模板', '内容审核', '举报处理', '用户反馈', '通知公告', 'AI 执行记录', '服务状态', '管理员', '操作日志']) {
      await nav(name);
      assert.ok(await page.locator('tbody tr').count() > 0, `${name}: populated table`);
      await page.getByRole('button', { name: '查看', exact: true }).first().click();
      await page.getByRole('dialog').waitFor();
      await close();
    }
    await nav('路线资源');
    await page.getByRole('button', { name: '新建路线', exact: true }).click();
    await page.getByLabel(/^名称/).fill('测试路线');
    await page.getByLabel(/^简介/).fill('测试公共路线');
    await page.getByLabel(/^地区/).fill('浙江杭州');
    await page.getByLabel(/^距离/).fill('12.5');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await page.getByRole('button', { name: '测试路线', exact: true }).click();
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await page.getByLabel('发布说明').fill('首次发布测试路线');
    await page.getByRole('button', { name: '确认发布', exact: true }).click();
    await close();
    assert.match(await page.locator('tbody tr').filter({ hasText: '测试路线' }).innerText(), /已发布/);
    await page.getByRole('button', { name: '测试路线', exact: true }).click();
    await page.getByRole('button', { name: '下架', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '确认下架' }).isDisabled(), true);
    await page.getByLabel('处理原因').fill('路线临时关闭');
    await page.getByRole('button', { name: '确认下架' }).click();
    await page.getByLabel('搜索记录').fill('不存在的记录');
    assert.equal(await page.locator('tbody tr').count(), 0);
    await page.getByRole('button', { name: '清除筛选' }).click();
    await page.getByRole('button', { name: '紧凑行距' }).click();
    assert.equal(await page.locator('.table-section').evaluate(element => element.classList.contains('compact')), true);
    await page.getByRole('button', { name: '最近更新', exact: true }).click();
    assert.equal(await page.locator('th[aria-sort]').getAttribute('aria-sort'), 'ascending');

    await nav('内容审核');
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    await page.getByRole('button', { name: '通过审核', exact: true }).click();
    await page.getByRole('button', { name: '确认通过审核', exact: true }).click();
    await nav('用户反馈');
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    await page.getByRole('button', { name: '回复反馈' }).click();
    await page.getByLabel(/^处理回复/).fill('已复现问题，正在处理。');
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    assert.match(await page.getByRole('dialog').innerText(), /已复现问题/);
    await close();

    await nav('系统配置');
    await page.getByLabel('每位用户每日请求上限').fill('50');
    await page.getByRole('button', { name: '保存配置' }).click();
    await nav('角色权限');
    await page.getByLabel('审核内容与举报', { exact: true }).check();
    await page.getByRole('button', { name: '保存权限' }).click();
    await nav('系统配置');
    assert.equal(await page.getByLabel('每位用户每日请求上限').inputValue(), '50');
    await nav('角色权限');
    assert.equal(await page.getByLabel('审核内容与举报', { exact: true }).isChecked(), true);
    await nav('管理员');
    await page.getByRole('button', { name: 'Kaipa Admin', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '停用账户', exact: true }).count(), 0);
    await close();
    await nav('操作日志');
    await page.getByLabel('每页条数').selectOption('5');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isDisabled(), false);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前结果', exact: true }).click();
    assert.match((await download).suggestedFilename(), /mock.csv$/);
    await nav('举报处理');
    await page.getByRole('button', { name: '查看', exact: true }).first().click();
    await page.getByRole('button', { name: '查看关联内容' }).click();
    await page.getByRole('heading', { name: '内容审核', exact: true }).waitFor();
    assert.equal(await page.getByLabel('搜索记录').inputValue(), 'C-807');
    await page.goBack();
    await page.getByRole('heading', { name: '举报处理', exact: true }).waitFor();

    await page.screenshot({ path: '/tmp/kaipa-admin-framework-desktop.png' });
    await nav('系统配置');
    await page.screenshot({ path: '/tmp/kaipa-admin-framework-settings.png' });
    await page.getByRole('button', { name: '切换主题' }).click();
    await page.screenshot({ path: '/tmp/kaipa-admin-framework-settings-dark.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/kaipa-admin-framework-mobile-dark.png' });
    assert.equal(await page.locator('.admin').evaluate(element => element.scrollWidth === element.clientWidth), true);
    await page.getByRole('button', { name: '切换主题' }).click();
    await page.getByRole('button', { name: '打开导航' }).click();
    await page.screenshot({ path: '/tmp/kaipa-admin-framework-mobile-nav.png' });
    await nav('公共装备库');
    await page.getByRole('button', { name: '新建装备' }).click();
    await page.screenshot({ path: '/tmp/kaipa-admin-framework-mobile-form.png' });
    assert.equal(await page.locator('.drawer').evaluate(element => element.scrollWidth === element.clientWidth), true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '重置模拟数据' }).click();
    await page.getByRole('button', { name: '确认重置' }).click();
    assert.deepEqual(errors, []);
    assert.equal(requests.some(request => /\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(request)), false);
    console.log('PASS: 16 modules, CRUD draft/publish/unpublish, required reason, search, sorting, density, review, reply, config, role matrix, protected current admin, pagination, CSV, cross-module links, history, light/dark/mobile, reset, no backend calls.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
