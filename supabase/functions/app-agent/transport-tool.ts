import { tool } from 'npm:@openai/agents@0.16.1';
import { z } from 'npm:zod@4.1.12';
import { reviewTransportPlan } from './transport-review.ts';

const place = z.string().min(1).max(200);
const minute = z.number().int().min(-43200).max(86400);
const leg = z.object({
  from: place,
  to: place,
  mode: z.enum(['rail', 'flight', 'bus', 'shuttle', 'taxi', 'carpool', 'self_drive', 'walk']),
  departure: minute,
  arrival: minute,
  bufferBefore: z.number().int().min(0).max(1440),
  verified: z.boolean(),
  sourceUrl: z.string().max(1000).nullable(),
  fallback: z.string().max(500).nullable(),
});

export const reviewTransport = tool({
  name: 'review_transport_plan',
  description: 'Check the complete proposed transport chain before appending itinerary items. Read the saved hiking window first. Times are minutes relative to midnight of the first hiking date; negative values mean earlier travel. Use consistent place names for shared endpoints. Include local transfers. Does not verify live services, save anything or authorize schedule changes.',
  parameters: z.object({
    direction: z.enum(['outbound', 'return', 'round_trip']),
    origin: place.nullable(),
    returnDestination: place.nullable(),
    trailStart: place,
    trailFinish: place,
    hikeStart: minute,
    hikeEnd: minute,
    arrivalBuffer: z.number().int().min(0).max(1440),
    departureBuffer: z.number().int().min(0).max(1440),
    outbound: z.array(leg).max(20),
    inbound: z.array(leg).max(20),
    vehicleRetrieval: z.string().max(500).nullable(),
  }),
  execute: (plan) => reviewTransportPlan(plan),
});
