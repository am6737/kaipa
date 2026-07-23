import { supabase } from './supabase';
import type { Poi } from '../data/pois';
import type { TLRow } from '../data/timeline';

export type SmartPlanProvider = 'auto' | 'kaipa-ai' | 'openai-compatible';

export interface SmartPlanPreferences {
  days?: number;
  startTime?: string;
  pace?: 'relaxed' | 'normal' | 'challenging';
  notes?: string;
}

export interface SmartPlanItem {
  day: string;
  title: string;
  timeStart?: number;
  timeEnd?: number;
  note?: string;
}

export interface SmartPlanResponse {
  provider: string;
  model?: string;
  items: SmartPlanItem[];
  warning?: string;
}

const toPlainTimeline = (rows: TLRow[]) => rows.map((r) => ({
  day: r.day,
  title: r.title,
  timeStart: r.timeStart,
  timeEnd: r.timeEnd,
}));

// The journey's `days` field is overloaded: "3 天" means 3 calendar days, but a
// recorded single push can store "11 时" / "11 小时" (11 *hours*). Blindly
// parseInt-ing "11 时" yields 11 *days*, which makes the planner invent an
// 11-day daytime itinerary for what is really an overnight hike. Distinguish
// the two, and surface the real trip duration in hours (track duration wins).
export function parseJourneySchedule(poi: Poi): { days?: number; durationHours?: number } {
  const raw = (poi.days || '').trim();
  const num = Number.parseFloat(raw);
  const saysHours = /时|小时|hr|hour|\bh\b/i.test(raw);
  const saysDays = /天|日|day/i.test(raw);
  const durationHours = poi.trackDurationMs != null
    ? Math.round((poi.trackDurationMs / 3600000) * 10) / 10
    : (saysHours && Number.isFinite(num) ? num : undefined);
  // Hours-denominated, or a known sub-24h duration → a single (possibly overnight) push.
  if (saysHours || (durationHours != null && durationHours <= 24 && !saysDays)) {
    return { days: 1, durationHours };
  }
  if (saysDays && Number.isFinite(num)) {
    return { days: Math.max(1, Math.min(14, Math.round(num))), durationHours };
  }
  return { days: undefined, durationHours };
}

const toPlainJourney = (poi: Poi) => {
  const sched = parseJourneySchedule(poi);
  return {
    id: poi.id,
    name: poi.name,
    region: poi.region,
    distance: poi.dist,
    ascent: poi.asc,
    difficulty: poi.diff,
    date: poi.date || poi.plannedDate,
    durationHours: sched.durationHours,
    description: poi.desc,
    waypoints: poi.trackWaypoints,
  };
};

export async function generateSmartPlan(args: {
  poi: Poi;
  rows: TLRow[];
  provider?: SmartPlanProvider;
  preferences: SmartPlanPreferences;
}): Promise<SmartPlanResponse> {
  const { data, error } = await supabase.functions.invoke<SmartPlanResponse>('smart-plan', {
    body: {
      provider: args.provider || 'auto',
      preferences: args.preferences,
      journey: toPlainJourney(args.poi),
      existingTimeline: toPlainTimeline(args.rows),
    },
  });
  if (error) throw new Error(error.message || 'Smart plan failed');
  if (!data?.items?.length) throw new Error('Smart plan returned no items');
  return data;
}
