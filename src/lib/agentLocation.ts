import * as Location from 'expo-location';
import { CurrentPositionError, getCurrentPosition, type CurrentPosition } from './currentPosition';
import { normalizeAgentLocation, type AgentLocation } from '../../supabase/functions/app-agent/location';
import type { TravelContext } from '../../supabase/functions/app-agent/travel-context';

export type { AgentLocation };

export function requestsCurrentLocation(message: string): boolean {
  // Do not ask for permission when the user explicitly declines location sharing.
  if (/(不要|不用|别|无需).{0,10}(定位|当前位置|我的位置|(?:设备|手机)(?:的)?位置)|\b(?:do not|don't)\b.{0,20}\b(?:location|locate|gps)\b/i.test(message)) return false;
  return /当前位置|当前定位|(?:本次|这次)(?:的)?定位|(?:设备|手机)(?:的)?(?:当前位置|当前定位|定位|位置)|现在的位置|我现在在哪|我现在所在|我所在的位置|我的位置|从我这[里儿]出发|从这里出发|帮我定位|获取定位|\b(?:my|current)\s+location\b|\b(?:start|depart|leave)\s+from\s+here\b|\bwhere\s+i\s+am\b/i.test(message);
}

// A message that names its own origin ("从重庆出发去…") keeps it; a device fix
// sent with it would outrank what the user wrote.
export function statesDeparture(message: string): boolean {
  return /从(?!这|那|我|当前|现在|出发)[^\s，。,.！!？?、；;从]{2,20}?(?:出发|动身|启程|过去|飞|坐|开车|自驾|到|去)/.test(message)
    || /\b(?:leav(?:e|ing)|depart(?:ing)?|start(?:ing)?|com(?:e|ing))\s+from\s+(?!(?:here|there|my|your|the|and|current|where)\b)[a-z]/i.test(message);
}

export type AgentLocationIntent = 'transport' | 'request_location';

// The departure this conversation already settled for the journey, if any.
export function confirmedDeparture(travel: TravelContext | null | undefined, journeyId?: string): string | undefined {
  return travel?.journeyId === (journeyId || null) && travel.origin ? travel.origin : undefined;
}

export function transportLocationIntent(reply: { action?: string; label: string }): AgentLocationIntent | undefined {
  if (reply.action === 'request_location') return 'request_location';
  if (reply.action === 'supplement_plan' && /交通|transport/i.test(reply.label)) return 'transport';
  return undefined;
}

export async function getAgentLocation(message: string, timeoutMs = 15_000, intent?: AgentLocationIntent): Promise<AgentLocation | undefined> {
  const explicit = requestsCurrentLocation(message);
  if (!intent && !explicit) return undefined;
  if (/(不要|不用|别|无需).{0,10}(定位|位置)|\b(?:do not|don't)\b.{0,20}\b(?:location|locate|gps)\b/i.test(message)) return undefined;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && intent === 'transport') {
      return { status: permission.canAskAgain ? 'permission_required' : 'permission_denied' };
    }
    if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'permission_denied' };
    let position: CurrentPosition;
    try {
      position = await getCurrentPosition(timeoutMs);
    } catch (error) {
      if (error instanceof CurrentPositionError && error.code !== 'unavailable') return { status: error.code };
      return { status: 'unavailable' };
    }
    const fix = normalizeAgentLocation({ status: 'available', latitude: position.lat,
      longitude: position.lng, accuracy: position.accuracy,
      timestamp: position.timestamp, coordinateSystem: 'WGS84' }) ?? { status: 'unavailable' as const };
    if (fix.status !== 'available') return fix;
    // City-level planning does not need a street, house number or exact address.
    const placeName = (place?: CurrentPosition['place']) => place
      ? [...new Set([place.region, place.city, place.district].filter(Boolean))].join(' ')
      : '';
    // AMap resolves the place with the fix; the system provider needs a lookup.
    const known = placeName(position.place);
    if (known) return { ...fix, placeName: known };
    let geocodeTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const addresses = await Promise.race([
        Location.reverseGeocodeAsync({ latitude: position.lat, longitude: position.lng }),
        new Promise<null>((resolve) => { geocodeTimer = setTimeout(() => resolve(null), 2000); }),
      ]);
      const address = addresses?.[0];
      const name = placeName(address ? { region: address.region ?? undefined, city: address.city ?? undefined, district: address.district ?? undefined } : undefined);
      return { ...fix, ...(name ? { placeName: name } : {}) };
    } catch {
      return fix;
    } finally {
      clearTimeout(geocodeTimer);
    }
  } catch {
    return { status: 'unavailable' };
  }
}
