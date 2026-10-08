import { z } from 'npm:zod@4.1.12';
import type { TravelContext } from './travel-context.ts';
import type { AgentQuickReply } from './types.ts';
import { normalizeAgentLocation, type AgentLocation } from './location.ts';

export const travelModes = ['rail', 'flight', 'self_drive'] as const;
export const travelRequestSchema = z.object({
  origin: z.string().max(200).nullable().default(null),
  returnDestination: z.string().max(200).nullable().default(null),
  modes: z.array(z.enum(travelModes)).max(3).default([]),
  adults: z.number().int().min(1).max(9).default(1),
  originQuote: z.string().max(500).default(''),
  modesQuote: z.string().max(500).default(''),
});
export type TravelRequest = z.infer<typeof travelRequestSchema>;

export function resolveTravelRequest(input: TravelRequest | null | undefined, confirmed?: TravelContext | null, location?: AgentLocation): TravelRequest {
  const request = travelRequestSchema.parse(input || {});
  request.origin ||= confirmed?.origin || null;
  const fix = normalizeAgentLocation(location);
  if (!request.origin && !confirmed?.locationDeclined && fix?.status === 'available' && fix.placeName) {
    request.origin = fix.placeName;
  }
  request.returnDestination ||= confirmed?.returnDestination || request.origin;
  if (!request.modes.length) {
    const preferences = confirmed?.preferences.join(' ') || '';
    if (/高铁|火车|铁路|\brail\b|\btrain\b/i.test(preferences)) request.modes.push('rail');
    if (/飞机|航班|航空|\bflight\b|\bfly\b/i.test(preferences)) request.modes.push('flight');
    if (/自驾|开车|\bself.drive\b|\bdriving\b/i.test(preferences)) request.modes.push('self_drive');
    if (/都可以|不限|\bany\b/i.test(preferences)) request.modes = [...travelModes];
  }
  // With no preference, compare public transport instead of adding a questionnaire.
  if (!request.modes.length) request.modes = ['rail', 'flight'];
  return request;
}

export function travelIntake(request: TravelRequest, location?: AgentLocation, declined = false, locale = 'zh'): { question: string; quickReplies: AgentQuickReply[] } | null {
  const en = locale.startsWith('en');
  if (!request.origin) {
    const question = en
      ? 'Your current departure location is unavailable. Enable location access or enter your departure city.'
      : '暂时无法获取当前出发位置，请开启定位或填写出发城市。';
    return { question, quickReplies: !declined && (!location || location.status === 'permission_required')
      ? [{ label: en ? 'Use my location' : '获取当前位置', message: en ? 'Use my current location for departure.' : '获取当前位置作为出发地。', action: 'request_location' as const }]
      : [] };
  }
  return null;
}

export function travelContextFromRequest(request: TravelRequest, previous: TravelContext | null | undefined, journeyId: string | null): TravelContext {
  return { journeyId, origin: request.origin, returnDestination: request.returnDestination,
    direction: previous?.direction || 'round_trip', preferences: request.modes.length ? request.modes : previous?.preferences || [],
    bookings: previous?.bookings || [], locationDeclined: previous?.locationDeclined || false };
}
