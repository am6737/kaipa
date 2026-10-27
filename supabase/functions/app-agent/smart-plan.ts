import { validIsoDate } from './itinerary-validation.ts';
import { taskDecisionSchema, type TaskDecision } from './task.ts';

// The smart plan button (新建旅程 → 智能规划) is a structured command, not
// free text: the app sends intent smart_plan with the journey it just saved.
// The server reads that journey, writes the planning request from its own
// template and builds the task decision directly, so the run skips the topic
// check, the intent router and the interpreter. The client's text never
// authorizes anything here; a changed client cannot use this intent to slip
// arbitrary words past the topic check.

type Client = any;

export type SmartPlanJourney = {
  id: string;
  name: string;
  plannedDate: string | null;
  days: number | null;
  track: { fileName: string; distM: number | null; ascM: number | null } | null;
  hasBoundTrack: boolean;
};

export async function loadSmartPlanJourney(client: Client, journeyId: string): Promise<SmartPlanJourney | null> {
  const row = await client.from('journeys').select('id,name,planned_date,total_days,track_id,tracks ( file_name, dist_m, asc_m, coords )')
    .eq('id', journeyId).is('deleted_at', null).maybeSingle();
  if (row.error) throw row.error;
  const name = typeof row.data?.name === 'string' ? row.data.name.trim().slice(0, 200) : '';
  if (!row.data || !name) return null;
  // PostgREST may return the relation as an object or a one-element array.
  const related = Array.isArray(row.data.tracks) ? row.data.tracks[0] : row.data.tracks;
  const coords = Array.isArray(related?.coords) ? related.coords.length : 0;
  const plannedDate = typeof row.data.planned_date === 'string' && validIsoDate(row.data.planned_date) ? row.data.planned_date : null;
  const days = Number.isInteger(row.data.total_days) && row.data.total_days >= 1 && row.data.total_days <= 30 ? row.data.total_days : null;
  return {
    id: row.data.id, name, plannedDate, days,
    track: related?.file_name ? { fileName: String(related.file_name).slice(0, 160), distM: related.dist_m ?? null, ascM: related.asc_m ?? null } : null,
    hasBoundTrack: Boolean(row.data.track_id) || coords >= 2,
  };
}

function monthDay(iso: string, locale: string) {
  const [, month, day] = iso.split('-').map(Number);
  return locale === 'en' ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}` : `${month}月${day}日`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Same wording as the app's journeyEdit.form.smartPrompt, which the planner
// has been tuned on; only the facts now come from the journey row.
export function smartPlanMessage(journey: SmartPlanJourney, locale = 'zh') {
  const en = locale === 'en';
  const dates = !journey.plannedDate ? (en ? 'Date not set' : '未设置日期')
    : journey.days && journey.days > 1 ? `${monthDay(journey.plannedDate, locale)} - ${monthDay(addDays(journey.plannedDate, journey.days - 1), locale)}`
    : monthDay(journey.plannedDate, locale);
  const duration = journey.days
    ? (en ? `${journey.days} days total (including return travel)` : `共 ${journey.days} 天`)
    : (en ? 'Total duration undecided; suggest total days including round-trip travel, trail transfers and hiking, but do not treat it as user-confirmed'
      : '全程天数待定，请结合往返交通、接驳和徒步给出建议总天数，不要当作用户已确定的天数');
  const track = journey.track
    ? [journey.track.fileName,
      journey.track.distM != null ? `${(journey.track.distM / 1000).toFixed(1)} km` : '',
      journey.track.ascM != null ? `+${journey.track.ascM} m` : ''].filter(Boolean).join(' ')
    : journey.hasBoundTrack ? (en ? 'bound to the journey' : '已绑定到旅程') : (en ? 'No track uploaded' : '未上传轨迹');
  return en
    ? `Plan “${journey.name}”. Dates: ${dates}, ${duration}. Track: ${track}. Include the daily outdoor itinerary and a gear checklist. Days mean the entire trip from departure to return, including travel time, not hiking days. Include round-trip main transport, trail transfers and necessary accommodation unless I explicitly decline. Depart from and return to my available current location by default without confirmation; explicitly supplied places override it. Ask only when location is unavailable and no departure place is supplied. Allocate hiking days after allowing travel time and state total versus hiking days.`
    : `请为旅程“${journey.name}”做规划。日期：${dates}，${duration}。轨迹：${track}。请结合目的地安排每日户外旅程和装备清单。天数指从出发到返回的整个旅程，包含路上时间，不等于徒步天数。除非我明确说不用，默认安排往返大交通、进出山接驳和必要住宿。默认从当前位置出发并返回，不需要询问确认；我明确指定其他出发地或返回地时优先采用。仅在定位不可用且未指定出发地时询问。结合交通耗时分配实际徒步日，说明全程天数与徒步天数。`;
}

// What the interpreter returns for this request, minus the parts
// constrainTaskDecision adds itself (schedule, map, packing and endpoint
// writes for a full plan). The message is the whole authorization quote.
export function smartPlanDecision(journey: SmartPlanJourney, message: string): TaskDecision {
  return taskDecisionSchema.parse({
    objective: message.slice(0, 1000), mode: 'execute', domain: 'hiking', continuation: false,
    authorizationQuote: message.slice(0, 1000),
    operations: ['add_itinerary_items'], requiredOperations: ['add_itinerary_items'],
    fullHikingPlan: true, includeRoundTripTransport: true, travelRequest: null,
    destination: journey.name, plannedDate: journey.plannedDate, dateUndecided: !journey.plannedDate,
    days: journey.days, trackAttachmentName: journey.track?.fileName ?? null,
    packingMode: 'full', constraints: [],
  });
}
