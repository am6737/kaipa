import { z } from 'npm:zod@4.1.12';

export const overnightReviewSchema = z.object({
  sourceUrl: z.string().url().max(2000).optional(),
  campQuote: z.string().trim().min(8).max(1000).optional().describe('可选的已读取攻略过夜原文；没有攻略证据时省略，仍可保存轨迹候选终点'),
  waterStatus: z.enum(['reported', 'unknown', 'unavailable']).describe('reported 仅表示攻略提及，不代表当前可用或可直接饮用'),
  waterQuote: z.string().trim().max(1000).describe('同一来源的水源原文；unknown 时可为空'),
  waterPlan: z.string().trim().min(10).max(1000).describe('营地无需自带水源。无水或未知时说明上次补水、背水量估算与容器容量、到下次补水前的饮用做饭需求及缺水备选；未知水源不得作为必需补水点'),
  effortAssessment: z.string().trim().min(10).max(1000).describe('从上一过夜点出发的距离、爬升/下降、海拔、路况、徒步用时和天黑前抵达可行性；缺失数据明确说明，不能仅写平均公里数'),
});

export type OvernightReview = z.infer<typeof overnightReviewSchema>;
type Boundary = { endDistanceKm: number; locationName?: string; estimateBasis?: string; userDistanceQuote?: string; overnightReview?: OvernightReview };
type GuideReceipt = { tool_name: string; status: string; output?: unknown };

export function resolveHikingEndpoint<T extends { endDistanceKm?: number; locationName?: string; waypointIndex?: number; trackFinish?: boolean }>(endpoint: T, totalMeters: number, waypoints: unknown): T & { endDistanceKm: number; locationName?: string } {
  if (endpoint.waypointIndex !== undefined || endpoint.trackFinish) {
    if (endpoint.endDistanceKm !== undefined || endpoint.locationName !== undefined || (endpoint.trackFinish && endpoint.waypointIndex !== undefined)) {
      throw new Error('按 waypointIndex 或 trackFinish 选择终点时，不要重复提供名称和公里数；系统会从当前轨迹读取。');
    }
    if (endpoint.trackFinish) return { ...endpoint, endDistanceKm: totalMeters / 1000 };
    const index = endpoint.waypointIndex!;
    const point = record(Array.isArray(waypoints) && Number.isInteger(index) && index >= 0 ? waypoints[index] : null);
    if (typeof point.name !== 'string' || !point.name.trim() || typeof point.km !== 'number' || !Number.isFinite(point.km)) {
      throw new Error('waypointIndex 不是当前轨迹的有效标注点编号，请读取 track 分区后选择返回的编号。');
    }
    return { ...endpoint, locationName: point.name, endDistanceKm: point.km };
  }
  if (endpoint.endDistanceKm === undefined) throw new Error('请选择 waypointIndex、trackFinish 或明确的 endDistanceKm。');
  return { ...endpoint, endDistanceKm: endpoint.endDistanceKm };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compact(text: string) { return text.replace(/\s+/g, ' ').trim(); }

function evidenceTexts(receipts: GuideReceipt[], url: string): string[] {
  return receipts.flatMap(receipt => {
    const output = record(receipt.output);
    if (receipt.status !== 'completed' || output.available !== true) return [];
    if (receipt.tool_name === 'read_travel_guide' && output.url === url && typeof output.text === 'string') return [output.text];
    if (receipt.tool_name === 'read_travel_guide_images' && output.sourceUrl === url && Array.isArray(output.images)) {
      return output.images.flatMap(image => {
        const value = record(image);
        return typeof value.visibleText === 'string' ? [value.visibleText] : [];
      });
    }
    return [];
  });
}

// These checks establish provenance and a real stored position, not campsite safety.
export function validateHikingBoundary(endpoint: Boundary, totalMeters: number, waypoints: unknown, receipts: GuideReceipt[], userMessage = '') {
  if (endpoint.estimateBasis !== undefined) throw new Error('不能把按天数或时长分配的暂估点保存为每日过夜终点。请先确定有依据的过夜地点；缺少证据时保留为未完成方案。');
  const meters = endpoint.endDistanceKm * 1000;
  if (!Number.isFinite(meters) || meters <= 0 || meters > totalMeters + 1) throw new Error('终点超出绑定轨迹范围');
  const waypoint = (Array.isArray(waypoints) ? waypoints : []).map(record).find(point =>
    typeof point.name === 'string' && point.name === endpoint.locationName
    && typeof point.km === 'number' && Number.isFinite(point.km) && Math.abs(point.km * 1000 - meters) <= 1);
  if (Math.abs(meters - totalMeters) <= 1) {
    return { source: waypoint ? 'waypoint' as const : 'distance' as const, locationName: waypoint ? endpoint.locationName! : null };
  }

  const quote = endpoint.userDistanceQuote?.trim();
  if (quote) {
    const values = [...quote.matchAll(/(?:^|[^\d.+-])(\d+(?:\.\d+)?)\s*(?:km\b|公里|千米)/gi)];
    if (!userMessage.includes(quote) || !values.some(value => Math.abs(Number(value[1]) * 1000 - meters) <= 1)) {
      throw new Error('用户指定公里数必须引用本轮用户原话中的对应 km/公里数，不能把 AI 的计算结果当作用户指定');
    }
    return { source: 'distance' as const, locationName: '用户指定分段点（营地与水源未核实）' };
  }
  if (!waypoint) throw new Error('中间过夜终点必须匹配绑定轨迹中同名、同累计公里数的标注点。均分里程、攻略距离或虚构营地名称不能代替轨迹定位。');
  if (typeof waypoint.distanceFromTrackMeters === 'number' && waypoint.distanceFromTrackMeters > 100) {
    throw new Error('该标注点距轨迹超过 100 米，不能把最近轨迹位置当作营地位置；需要核实离线接近路线，不能直接吸附写入');
  }
  const candidate = { source: 'waypoint' as const, locationName: `${endpoint.locationName}（候选终点，扎营条件待核实）` };
  if (!endpoint.overnightReview) return candidate;
  const parsed = overnightReviewSchema.safeParse(endpoint.overnightReview);
  if (!parsed.success) throw new Error('过夜评估格式不完整；攻略来源和过夜引文可省略，请如实填写水源情况、背水备选与当天难度。');
  const review = parsed.data;
  const texts = review.sourceUrl ? evidenceTexts(receipts, review.sourceUrl).map(compact) : [];
  if (review.campQuote && !texts.some(text => text.includes(compact(review.campQuote!)))) throw new Error('提供的过夜引文必须来自已读取正文或图片文字；没有引文时请省略，按轨迹候选终点保存，不得编造');
  if (review.waterStatus !== 'unknown' && (!review.waterQuote || !texts.some(text => text.includes(compact(review.waterQuote))))) {
    throw new Error('水源描述缺少已读取原文依据，请标为 unknown 并说明不依赖该水源的备选安排');
  }
  return review.campQuote ? { source: 'waypoint' as const, locationName: endpoint.locationName! } : candidate;
}
