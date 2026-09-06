import { canonicalJourneyDay, journeyDayOrdinal } from './journey-days.ts';
import { itineraryMinutes } from './itinerary-time.ts';

export type ItineraryItemDraft = {
  day: string;
  title: string;
  timeStart?: string;
  timeEnd?: string;
};

export type ItineraryValidationIssue = {
  index: number;
  title: string;
  message: string;
};

const VAGUE_TITLE = /^(?:出发|集合|早餐|午餐|晚餐|用餐|徒步|登山|游览|游玩|活动|休息|住宿|入住|返程|返回|前往目的地|抵达目的地|自由活动|交通|行程安排)$/i;
const VAGUE_TRANSPORT = /(公共交通|交通工具)/;
const OVERNIGHT_TITLE = /(过夜|通宵|夜行|卧铺|次日)/;

export function validIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateItineraryItems(items: ItineraryItemDraft[], maxDays?: number): ItineraryValidationIssue[] {
  const issues: ItineraryValidationIssue[] = [];
  const seen = new Set<string>();
  const lastStartByDay = new Map<string, number>();

  items.forEach((item, index) => {
    const title = item.title.trim().replace(/\s+/g, ' ');
    const day = canonicalJourneyDay(item.day);
    const issue = (message: string) => issues.push({ index, title: title || `第 ${index + 1} 项`, message });
    const ordinal = journeyDayOrdinal(day);
    const start = itineraryMinutes(item.timeStart);
    const end = itineraryMinutes(item.timeEnd);

    if (VAGUE_TITLE.test(title)) issue('标题过于笼统，请写明具体地点、路线段、活动内容或交通方式');
    if (VAGUE_TRANSPORT.test(title)) issue('交通方式过于笼统，请写明公交、地铁、网约车、自驾等明确方式；有可靠信息时同时写明线路或上下车点');
    if (maxDays && ordinal && ordinal > maxDays) issue(`日序超出旅程的 ${maxDays} 天范围`);
    if (item.timeEnd && !item.timeStart) issue('填写结束时间时必须同时填写开始时间');
    if (start != null && end != null && end <= start && !OVERNIGHT_TITLE.test(title)) {
      issue('结束时间必须晚于开始时间；跨夜安排请在标题中注明“次日”或“过夜”');
    }

    const duplicateKey = `${day.toLocaleLowerCase()}\u0000${title.toLocaleLowerCase()}`;
    if (seen.has(duplicateKey)) issue('同一天不能重复添加相同安排');
    seen.add(duplicateKey);

    if (start != null) {
      const previousStart = lastStartByDay.get(day);
      if (previousStart != null && start < previousStart) issue('同一天的安排必须按开始时间顺序提交');
      lastStartByDay.set(day, start);
    }
  });

  return issues;
}

export function itineraryValidationError(issues: ItineraryValidationIssue[]) {
  return `行程安排未达到可执行标准，请修正所有问题后重新调用 add_itinerary_items：\n${issues
    .slice(0, 12)
    .map((issue) => `${issue.index + 1}. ${issue.title}：${issue.message}`)
    .join('\n')}${issues.length > 12 ? `\n另有 ${issues.length - 12} 项不合格。` : ''}`;
}
