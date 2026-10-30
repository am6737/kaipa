// meetingPoint.ts — the journey's 集合: when it is, and how to get there.
//
// The 集合 day is stored relative to the journey's first day (0 that day, -1 the
// evening before), so moving the trip's dates moves the meeting with it.
// 导航 hands the place to the phone's own map app, the one people already use to
// drive to a trailhead: AMap on Android, Apple Maps on iOS. Both take the GCJ-02
// coordinates the place search returns.
import { Linking, Platform } from 'react-native';
import type { JourneyMeetPlace } from '../data/pois';

export function meetingDate(startDate: Date | null, meetDay: number | undefined): Date | null {
  if (!startDate) return null;
  const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  date.setDate(date.getDate() + (meetDay ?? 0));
  return date;
}

export const formatMeetTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Opens turn-by-turn directions to the place in the system map app. */
export async function navigateToPlace(place: JourneyMeetPlace): Promise<void> {
  const name = encodeURIComponent(place.name);
  if (Platform.OS === 'ios') {
    await Linking.openURL(`maps://?daddr=${place.lat},${place.lng}&q=${name}`);
    return;
  }
  try {
    await Linking.openURL(`androidamap://route?sourceApplication=kaipa&dlat=${place.lat}&dlon=${place.lng}&dname=${name}&dev=0&t=0`);
  } catch {
    // No AMap installed: its web page offers the same route and the app download.
    await Linking.openURL(`https://uri.amap.com/navigation?to=${place.lng},${place.lat},${name}&mode=car&coordinate=gaode&src=kaipa&callnative=1`);
  }
}
