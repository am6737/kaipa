import { renderTaskResponse } from './response-presentation.ts';

Deno.test('partial planning keeps the saved journey and labels the remaining proposal as unsaved', () => {
  const draft = { title: '五天候选', body: '第四晚补水安排待核实', assumptions: ['自行背水'], unverified: ['补水点'] };
  const message = renderTaskResponse({ text: '全部完成', draft, blocker: '第四晚待核实' }, {
    status: 'partial', draft: null, pendingQuestion: null, missingOperations: ['set_itinerary_group_endpoints'],
  }, 'zh', '哈天线');
  for (const expected of ['旅程「哈天线」已保存', '查看旅程', '方案草稿（未保存）', draft.body, '自行背水']) {
    if (!message.includes(expected)) throw new Error(`Missing ${expected}`);
  }
  if (message.includes('全部完成')) throw new Error('False completion claim');
});

Deno.test('waiting response displays the actual location confirmation question exactly once', () => {
  const pendingQuestion = '本次定位显示在广州市，是否从广州出发并返回广州？';
  const outcome = { status: 'waiting' as const, pendingQuestion, draft: null, missingOperations: [] };
  const text = renderTaskResponse({ text: '已读取徒步起终点。', draft: null }, outcome, 'zh');
  if (!text.includes(pendingQuestion)) throw new Error('Location confirmation hidden');
  const alreadyVisible = renderTaskResponse({ text, draft: null }, outcome, 'zh');
  if (alreadyVisible !== text) throw new Error('Question duplicated');
  const paraphrase = '定位显示在广州，这次是广州往返吗？';
  if (renderTaskResponse({ text: paraphrase, draft: null }, outcome, 'zh') !== paraphrase) {
    throw new Error('A visible paraphrased question was duplicated');
  }
});

Deno.test('draft display retains assumptions and never claims it is saved', () => {
  const draft = { title: 'Route', body: 'A to B', assumptions: ['Dry weather'], unverified: ['Opening hours'] };
  for (const locale of ['zh', 'en'] as const) {
    const message = renderTaskResponse({ text: 'Done', draft }, { status: 'draft', draft: { ...draft, id: 'run' }, pendingQuestion: null, missingOperations: [] }, locale);
    if (!message.includes('Dry weather') || !message.includes('Opening hours') || !/未保存|not saved/.test(message)) throw new Error('Draft state or caveats lost');
  }
});

Deno.test('missing receipts replace a false completion claim', () => {
  const message = renderTaskResponse({ text: 'Everything saved!', draft: null }, { status: 'partial', draft: null, pendingQuestion: null, missingOperations: ['add_packing_items'] }, 'en');
  if (message.includes('Everything saved') || !message.includes('not complete')) throw new Error('False completion shown');
});

Deno.test('partial save with a question cannot display an all-complete claim', () => {
  const message = renderTaskResponse({ text: 'Everything saved!', draft: null }, {
    status: 'partial', draft: null, pendingQuestion: 'Which departure station?', missingOperations: ['add_itinerary_items'],
  }, 'en');
  if (message.includes('Everything saved') || !message.includes('Which departure station?') || !message.includes('not complete')) {
    throw new Error('Partial clarification must retain the question without claiming completion');
  }
});

Deno.test('an incomplete response retains the actionable conflict reason', () => {
  const message = renderTaskResponse({ text: 'Everything saved!', draft: null, blocker: '09:30-10:30 overlaps the saved 09:00-11:00 hike.' }, {
    status: 'partial', draft: null, pendingQuestion: null, missingOperations: ['add_itinerary_items'],
  }, 'en');
  if (message.includes('Everything saved') || !message.includes('overlaps') || !message.includes('not complete')) {
    throw new Error('Conflict explanation was lost');
  }
});
