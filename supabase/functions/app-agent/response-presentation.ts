import type { PlanDraft, TaskOutcome } from './task.ts';

export function renderTaskResponse(output: { text: string; draft: PlanDraft | null; blocker?: string | null }, outcome: TaskOutcome, locale?: 'zh' | 'en', savedJourneyTitle?: string): string {
  const english = locale === 'en';
  if (outcome.status === 'partial') {
    const summary = english
      ? 'The requested changes are not complete. Any saved changes have been kept; I can continue with the remaining work.'
      : '本次要求的更改尚未全部完成，已经保存的内容会保留，可以继续处理剩余部分。';
    const journey = savedJourneyTitle ? (english
      ? `Journey "${savedJourneyTitle}" is saved. You can open it using the journey card; the itinerary is not yet complete.`
      : `旅程「${savedJourneyTitle}」已保存，可通过下方「查看旅程」进入；日程仍有待完善部分。`) : null;
    const draft = output.draft ? renderTaskResponse(output, { ...outcome, status: 'draft' }, locale) : null;
    return [journey || summary, output.blocker?.trim(), draft, outcome.pendingQuestion].filter(Boolean).join('\n\n');
  }
  if (outcome.status === 'draft' && output.draft) {
    const { title, body, assumptions, unverified } = output.draft;
    return [
      english ? `Draft (not saved): ${title}` : `方案草稿（未保存）：${title}`,
      body,
      assumptions.length ? `${english ? 'Assumptions' : '暂按以下条件估算'}：${assumptions.join('；')}` : null,
      unverified.length ? `${english ? 'Unverified' : '尚未核实'}：${unverified.join('；')}` : null,
    ].filter(Boolean).join('\n\n');
  }
  if (!output.text.trim()) throw new Error('Agent returned an empty response');
  if (outcome.status === 'waiting' && outcome.pendingQuestion && !output.text.includes(outcome.pendingQuestion)
    && !/[?？]\s*$/.test(output.text)) {
    return `${output.text.trim()}\n\n${outcome.pendingQuestion}`;
  }
  return output.text;
}
