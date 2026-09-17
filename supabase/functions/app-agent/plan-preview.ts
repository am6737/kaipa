import type { AgentPlanPreview } from './types.ts';
import { canonicalJourneyDay, journeyDayOrdinal } from './journey-days.ts';

export function previewJourneyId(calls: Array<{ tool_name: string; status: string; arguments?: { journeyId?: unknown }; output?: { id?: unknown }; undone_at?: unknown }>, currentJourneyId?: string | null): string | undefined {
  for (const call of [...calls].reverse()) {
    if (call.status !== 'completed' || call.undone_at) continue;
    const id = call.tool_name === 'create_journey' ? call.output?.id
      : ['add_itinerary_items', 'update_journey_schedule', 'delete_itinerary_items', 'set_itinerary_group_endpoints'].includes(call.tool_name)
      ? call.arguments?.journeyId : undefined;
    if (typeof id === 'string' && id) return id;
  }
  return currentJourneyId || undefined;
}

export async function loadSavedPlanPreview(client: any, journeyId: string): Promise<AgentPlanPreview | undefined> {
  const journey = await client.from('journeys').select('id,name,planned_date,date').eq('id', journeyId).is('deleted_at', null).maybeSingle();
  if (journey.error) throw journey.error;
  if (!journey.data) return undefined;
  const rows: Array<{ id: string; day: string; title: string; time_mins: number | null; time_end_mins: number | null }> = [];
  for (let offset = 0; ; offset += 500) {
    const page = await client.from('timeline_rows').select('id,day,title,time_mins,time_end_mins')
      .eq('journey_id', journeyId).order('id').range(offset, offset + 499);
    if (page.error) throw page.error;
    rows.push(...page.data);
    if (page.data.length < 500) break;
  }
  const grouped = new Map<string, AgentPlanPreview['days'][number]['items']>();
  for (const row of rows) {
    const day = canonicalJourneyDay(row.day);
    const items = grouped.get(day) || [];
    items.push({ title: row.title, timeStart: row.time_mins ?? undefined, timeEnd: row.time_end_mins ?? undefined });
    grouped.set(day, items);
  }
  return {
    journeyId, title: journey.data.name, dateLabel: journey.data.planned_date || journey.data.date || undefined,
    days: [...grouped].sort(([a], [b]) => (journeyDayOrdinal(a) ?? Infinity) - (journeyDayOrdinal(b) ?? Infinity))
      .map(([label, items]) => ({ label, items: items.sort((a, b) => (a.timeStart ?? Infinity) - (b.timeStart ?? Infinity)) })),
  };
}
