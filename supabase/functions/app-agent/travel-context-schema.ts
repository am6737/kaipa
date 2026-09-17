import { z } from 'npm:zod@4.1.12';
import type { TravelContext } from './travel-context.ts';

export const travelContextSchema: z.ZodType<TravelContext> = z.object({
  journeyId: z.string().nullable(),
  origin: z.string().max(200).nullable().describe('Only the user-confirmed departure place. GPS and assistant suggestions are not confirmation.'),
  returnDestination: z.string().max(200).nullable().describe('Only the user-confirmed return place; resolve same-as-origin to its concrete place.'),
  direction: z.enum(['outbound', 'return', 'round_trip']).nullable(),
  preferences: z.array(z.string().max(200)).max(12),
  bookings: z.array(z.string().max(300)).max(12),
  locationDeclined: z.boolean(),
});

export function latestTravelContext(rows: Array<{ ui?: { travelContext?: unknown } | null }>, journeyId: string | null): TravelContext | null {
  const row = rows.find(row => row.ui?.travelContext !== undefined);
  const parsed = travelContextSchema.safeParse(row?.ui?.travelContext);
  return parsed.success && parsed.data.journeyId === journeyId ? parsed.data : null;
}
