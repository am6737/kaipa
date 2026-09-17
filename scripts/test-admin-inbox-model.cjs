const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { assignedTasks, resolveTask, isTaskOverdue } = require('../src/web/admin/adminInboxModel.ts');
for (const [kind, states] of Object.entries({ review: [['待审核', '待处理'], ['已通过', '已完成'], ['已驳回', '已完成']], report: [['待处理', '待处理'], ['处理中', '处理中'], ['已处理', '已完成']], feedback: [['处理中', '处理中'], ['已解决', '已完成']], publish: [['草稿', '待处理'], ['已发布', '已完成'], ['已下架', '已完成']] })) {
  const task = assignedTasks.find(item => item.kind === kind);
  for (const [source, expected] of states) {
    const record = { id: task.target.id, name: '测试', status: source, date: '', owner: '', category: '', detail: '' };
    assert.equal(resolveTask(task, { [task.target.section]: [record] }).status, expected);
  }
  assert.equal(resolveTask(task, { [task.target.section]: [] }).status, '关联记录不可用');
}
const task = assignedTasks[0];
const deadline = Date.parse(task.due.replace(' ', 'T') + ':00Z');
assert.equal(isTaskOverdue(task, '待处理', deadline), false);
assert.equal(isTaskOverdue(task, '待处理', deadline + 1), true);
assert.equal(isTaskOverdue(task, '已完成', deadline + 1), false);
assert.equal(assignedTasks.filter(task => task.assignee === 'A-001').length, 5);
console.log('PASS: assignment boundary, business-driven task states, missing targets, UTC deadlines.');
