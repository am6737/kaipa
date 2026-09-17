import * as Location from 'expo-location';
import { normalizeAgentLocation, type AgentLocation } from '../../supabase/functions/app-agent/location';
import type { TravelContext } from '../../supabase/functions/app-agent/travel-context';

export type { AgentLocation };

export function requestsCurrentLocation(message: string): boolean {
  // Do not ask for permission when the user explicitly declines location sharing.
  if (/(不要|不用|别|无需).{0,10}(定位|当前位置|我的位置|(?:设备|手机)(?:的)?位置)|\b(?:do not|don't)\b.{0,20}\b(?:location|locate|gps)\b/i.test(message)) return false;
  return /当前位置|当前定位|(?:本次|这次)(?:的)?定位|(?:设备|手机)(?:的)?(?:当前位置|当前定位|定位|位置)|现在的位置|我现在在哪|我现在所在|我所在的位置|我的位置|从我这[里儿]出发|从这里出发|帮我定位|获取定位|\b(?:my|current)\s+location\b|\b(?:start|depart|leave)\s+from\s+here\b|\bwhere\s+i\s+am\b/i.test(message);
}

export type AgentLocationIntent = 'transport' | 'request_location';

export function shouldSuggestTransportLocation(travel: TravelContext | null | undefined, journeyId?: string): boolean {
  return travel?.journeyId !== (journeyId || null) || (!travel?.origin && !travel?.locationDeclined);
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
    if (!await Location.hasServicesEnabledAsync()) return { status: 'services_disabled' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Expo's one-shot request has no cancellation API; ignore late results.
      return await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(async (position): Promise<AgentLocation> => {
          const fix = normalizeAgentLocation({ status: 'available', latitude: position.coords.latitude,
            longitude: position.coords.longitude, accuracy: position.coords.accuracy,
            timestamp: position.timestamp, coordinateSystem: 'WGS84' }) ?? { status: 'unavailable' as const };
          if (fix.status !== 'available') return fix;
          let geocodeTimer: ReturnType<typeof setTimeout> | undefined;
          try {
            const addresses = await Promise.race([
              Location.reverseGeocodeAsync(position.coords),
              new Promise<null>((resolve) => { geocodeTimer = setTimeout(() => resolve(null), 2000); }),
            ]);
            const address = addresses?.[0];
            // City-level planning does not need a street, house number or exact address.
            const placeName = address ? [...new Set([address.region, address.city, address.district].filter(Boolean))].join(' ') : '';
            return { ...fix, ...(placeName ? { placeName } : {}) };
          } catch {
            return fix;
          } finally {
            clearTimeout(geocodeTimer);
          }
        }),
        new Promise<AgentLocation>((resolve) => { timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { status: 'unavailable' };
  }
}
