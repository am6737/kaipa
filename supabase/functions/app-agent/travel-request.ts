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

const intakeReasons: Record<string, { zh: string; en: string }> = {
  permission_denied: { zh: '没有定位权限，', en: 'Location access is off, so ' },
  services_disabled: { zh: '手机定位服务已关闭，', en: 'Location services are disabled, so ' },
  timeout: { zh: '这次没能获取到位置，', en: 'Your location could not be found this time, so ' },
  unavailable: { zh: '这次没能获取到位置，', en: 'Your location could not be found this time, so ' },
  stale: { zh: '这次没能获取到位置，', en: 'Your location could not be found this time, so ' },
  available: { zh: '定位成功，但没能识别所在城市，', en: 'Your city could not be identified from your location, so ' },
};

// Only reached when the plan needs round-trip transport and no departure is
// known. The app answers with its departure picker, which offers the current
// location and manual entry; the question states the real reason rather than
// reporting a failure when location was simply never requested.
export function travelIntake(request: TravelRequest, location?: AgentLocation, locale = 'zh'): { question: string; quickReplies: AgentQuickReply[] } | null {
  if (request.origin) return null;
  const en = locale.startsWith('en');
  const reason = location ? intakeReasons[location.status] : undefined;
  const question = en
    ? `${reason?.en ?? ''}${reason ? 'please' : 'Please'} set your departure place so I can plan the round trip.`
    : `${reason?.zh ?? ''}请设置出发地，我再安排往返交通。`;
  return { question, quickReplies: [{ label: en ? 'Set departure' : '设置出发地',
    message: en ? 'Use my current location for departure.' : '获取当前位置作为出发地。', action: 'request_location' as const }] };
}

export function travelContextFromRequest(request: TravelRequest, previous: TravelContext | null | undefined, journeyId: string | null): TravelContext {
  return { journeyId, origin: request.origin, returnDestination: request.returnDestination,
    direction: previous?.direction || 'round_trip', preferences: request.modes.length ? request.modes : previous?.preferences || [],
    bookings: previous?.bookings || [], locationDeclined: previous?.locationDeclined || false };
}
