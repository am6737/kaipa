import { estimatePersonalPackingNeeds } from './personal-planning.ts';
import type { PackingPlanProfile } from './packing-coverage.ts';

// Diagnostic of whether the estimator supplies a water target, not a safety evaluation.
const cases: Array<{
  id: string;
  hours?: number;
  refill: PackingPlanProfile['waterRefill'];
  conditions?: PackingPlanProfile['conditions'];
  itinerary?: Array<{ day: number; time_mins: number; time_end_mins: number }>;
}> = [
  { id: 'distance-only-unknown-refill', refill: 'unknown' },
  { id: 'four-hours-no-refill', hours: 4, refill: 'none' },
  { id: 'eight-hours-no-refill', hours: 8, refill: 'none' },
  { id: 'eight-hours-unknown-refill', hours: 8, refill: 'unknown' },
  { id: 'eight-hours-treated-refill', hours: 8, refill: 'treated' },
  { id: 'eight-hours-natural-refill', hours: 8, refill: 'natural' },
  { id: 'eight-hours-hot-no-refill', hours: 8, refill: 'none', conditions: ['hot'] },
  { id: 'eight-hours-hot-treated-refill', hours: 8, refill: 'treated', conditions: ['hot'] },
  { id: 'fourteen-hours-no-refill', hours: 14, refill: 'none' },
  {
    id: 'two-two-hour-blocks-eight-hour-span',
    refill: 'none',
    itinerary: [
      { day: 1, time_mins: 480, time_end_mins: 600 },
      { day: 1, time_mins: 840, time_end_mins: 960 },
    ],
  },
];

const results = cases.map(({ id, hours, refill, conditions, itinerary }) => {
  const journey = { total_days: 1, dist: 18, asc_: null, track_duration_ms: null };
  const plan: PackingPlanProfile = {
    accommodation: 'day_trip', waterRefill: refill, mealPreparation: 'no_cook',
    ...(conditions ? { conditions } : {}),
  };
  const result = estimatePersonalPackingNeeds({}, journey, itinerary ?? [], plan, hours);
  return {
    id,
    input: { journey, plan, itinerary: itinerary ?? [], activeHoursPerDay: hours ?? null },
    estimatedActiveHours: result.trip.estimatedActiveHours,
    startingWaterLiters: 'startingWaterLiters' in result.recommendation ? result.recommendation.startingWaterLiters : null,
  };
});

console.log(JSON.stringify({
  kind: 'synthetic-local-estimator-baseline',
  safetyValidated: false,
  liveModelEvaluated: false,
  results,
}, null, 2));
