import type {
  PlanDocument,
  ResearchBrief,
  TransportPlan,
} from "./plan-document.ts";
import { canonicalJourneyDay, journeyDayOrdinal } from "./journey-days.ts";
import { itineraryMinutes } from "./itinerary-time.ts";
import { validIsoDate } from "./itinerary-validation.ts";

export const DEPARTURE_BUFFER_MINUTES = 60;
export const DAILY_LOAD_WARNING_HOURS = 10;
export const DAILY_LOAD_BLOCKER_HOURS = 14;
export const HIKING_KM_PER_HOUR = 4;
export const ASCENT_METERS_PER_HOUR = 600;
export const HIGH_SLEEP_ELEVATION_METERS = 3000;
export const SLEEP_ELEVATION_GAIN_METERS = 500;
export const LOW_SLEEP_ELEVATION_METERS = 1500;

export type FeasibilityIssue = {
  code: string;
  severity: "blocker" | "warning";
  day: string | null;
  message: string;
  detail?: Record<string, unknown>;
};
export type DayLoad = {
  day: string;
  hikingHours: number | null;
  transferHours: number | null;
  sleepLocation: string | null;
  sleepElevationMeters: number | null;
};
type Item = PlanDocument["itineraryItems"][number];
type Endpoint = PlanDocument["endpoints"][number];
type Route = ResearchBrief["routes"][number];
type Waypoint = Route["waypoints"][number];
const TRANSPORT =
  /接驳|转乘|包车|拼车|班车|公交|地铁|出租|网约车|自驾|高铁|动车|火车|列车|卧铺|航班|飞机|跨城|异地|\b(?:transfer|train|flight|bus|taxi)\b/i;
const LODGING =
  /营地|露营|客栈|民宿|酒店|旅馆|招待所|住宿|\b(?:camp|lodge|hotel)\b/i;
const LONG_DISTANCE =
  /高铁|动车|火车|列车|卧铺|航班|飞机|\b(?:train|flight|[GDCZTKY]\d{1,5}|(?:[A-Z][A-Z0-9]|[0-9][A-Z])\d{3,4})\b/i;
const OVERNIGHT = /过夜|通宵|夜行|卧铺|次日/;
const key = (value: string) => value.replace(/\s/g, "").toLowerCase();
const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && key(a) === key(b);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function duration(item: Item): number | null {
  const start = itineraryMinutes(item.timeStart),
    end = itineraryMinutes(item.timeEnd);
  if (start == null || end == null) return null;
  if (end > start) return (end - start) / 60;
  return end < start && OVERNIGHT.test(item.title)
    ? (end + 1440 - start) / 60
    : null;
}
function isTransfer(item: Item) {
  return item.kind === "custom" &&
    (!!item.location?.incomingMode || TRANSPORT.test(item.title) ||
      LONG_DISTANCE.test(item.title) ||
      (!!item.startLocation && !!item.location &&
        !same(item.startLocation.name, item.location.name)));
}

// Provider rows may live only in the transport artifact. Prefer plan rows
// for identical service/time/place rows; do not mutate either input.
function allItems(
  plan: PlanDocument,
  transport?: TransportPlan | null,
): Item[] {
  const items = [...plan.itineraryItems];
  for (const item of transport?.mainTravel?.itineraryItems ?? []) {
    if (
      !items.some((other) =>
        canonicalJourneyDay(other.day) === canonicalJourneyDay(item.day) &&
        other.timeStart === item.timeStart && other.timeEnd === item.timeEnd &&
        ((same(other.title, item.title) &&
          (other.location?.name ?? null) === (item.location?.name ?? null)) ||
          // Legacy plans repeat provider services with shorter titles. An exact
          // timed transport range is one journey, not two consecutive journeys.
          (duration(item) != null && isTransfer(other) &&
            LONG_DISTANCE.test(other.title) && LONG_DISTANCE.test(item.title)))
      )
    ) items.push(item);
  }
  return items;
}

function routeFor(
  endpoint: Endpoint,
  items: Item[],
  plan: PlanDocument,
  research?: ResearchBrief | null,
) {
  const ids = [
    ...new Set(
      items.filter((item) => item.kind === "activity").map((item) =>
        item.routeId
      ).filter(Boolean),
    ),
  ];
  const id = endpoint.routeId ??
    (ids.length === 1 ? ids[0] : plan.journey?.routeId);
  // A multi-route day with an unbound endpoint is ambiguous.
  if (!endpoint.routeId && ids.length > 1) return undefined;
  return research?.routes.find((route) =>
    id ? route.routeId === id : research.routes.length === 1
  );
}
function endpointPoint(
  endpoint: Endpoint,
  route?: Route,
): Waypoint | undefined {
  if (!route) return undefined;
  if (endpoint.waypointIndex != null) {
    return route.waypoints.find((point) =>
      point.index === endpoint.waypointIndex
    );
  }
  if (endpoint.trackFinish) {
    return [...route.waypoints].sort((a, b) => a.index - b.index).at(-1);
  }
  if (endpoint.locationName) {
    return route.waypoints.find((point) =>
      same(point.name, endpoint.locationName)
    );
  }
  if (endpoint.endDistanceKm != null) {
    return route.waypoints.find((point) =>
      Math.abs(point.distanceKm - endpoint.endDistanceKm!) < 0.001
    );
  }
  return undefined;
}
function endpointDistance(endpoint: Endpoint, route?: Route): number | null {
  if (finite(endpoint.endDistanceKm)) return endpoint.endDistanceKm;
  const point = endpointPoint(endpoint, route);
  if (point) return point.distanceKm;
  return endpoint.trackFinish && finite(route?.distanceKm)
    ? route.distanceKm
    : null;
}

// The current ResearchBrief schema has no ascent counters. Honor an actual
// additive cumulativeAscentMeters counter if supplied by a future producer;
// never substitute net elevation gain or distribute a route's total ascent.
function cumulativeAscent(point?: Waypoint): number | null {
  const value = (point as unknown as Record<string, unknown> | undefined)
    ?.cumulativeAscentMeters;
  return finite(value) && value >= 0 ? value : null;
}

function matchesPlaces(item: Item, from: string, to: string) {
  return (same(item.startLocation?.name, from) &&
    same(item.location?.name, to)) ||
    (key(item.title).includes(key(from)) && key(item.title).includes(key(to)) &&
      !same(from, to));
}
function matchingSegments(item: Item, transport?: TransportPlan | null) {
  return (transport?.segments ?? []).filter((segment) =>
    matchesPlaces(
      item,
      segment.fromLocation?.name ?? segment.from,
      segment.toLocation?.name ?? segment.to,
    ) ||
    matchesPlaces(item, segment.fromRoute, segment.toRoute) ||
    matchesPlaces(item, segment.from, segment.to)
  );
}
function matchingLegs(item: Item, plan: PlanDocument) {
  // Review-leg minutes are relative to the first hiking date, not journey
  // Day 1. Only a matching itinerary row establishes their journey day.
  return [
    ...(plan.transport?.outbound ?? []),
    ...(plan.transport?.inbound ?? []),
  ]
    .filter((leg) =>
      matchesPlaces(item, leg.from, leg.to) && leg.arrival > leg.departure
    );
}

/** Pure, deterministic checks of the available evidence, not a safety guarantee.
 * Null loads mean missing inputs; zero means no such activity on that day.
 * Day labels are canonicalized; order within a day is itinerary order, using
 * explicit times to decide whether a transfer follows the last hike.
 */
export function validatePlanFeasibility(plan: PlanDocument, ctx: {
  now: number;
  plannedDate: string | null;
  research?: ResearchBrief | null;
  transportPlan?: TransportPlan | null;
  timeZone?: "Asia/Shanghai";
}): { issues: FeasibilityIssue[]; days: DayLoad[] } {
  const issues: FeasibilityIssue[] = [], days: DayLoad[] = [];
  const items = allItems(plan, ctx.transportPlan);
  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const day = canonicalJourneyDay(item.day);
    grouped.set(day, [...(grouped.get(day) ?? []), item]);
  }
  for (const entry of [...plan.endpoints, ...plan.groupNotes]) {
    const day = canonicalJourneyDay(entry.day);
    if (!grouped.has(day)) grouped.set(day, []);
  }
  const dayCount = plan.schedule?.totalDays ?? plan.journey?.days;
  if (dayCount) {
    for (let n = 1; n <= dayCount; n++) {
      if (!grouped.has(`Day ${n}`)) grouped.set(`Day ${n}`, []);
    }
  }
  const labels = [...grouped.keys()].sort((a, b) =>
    (journeyDayOrdinal(a) ?? Infinity) - (journeyDayOrdinal(b) ?? Infinity)
  );
  const previousEndpoints = new Map<
    string,
    { distance: number | null; point?: Waypoint }
  >();
  const longDistanceDays = new Set<string>();
  let seenHighNight = false;

  for (const day of labels) {
    const rows = grouped.get(day)!;
    const hikes = rows.filter((item) => item.kind === "activity");
    const transfers = rows.filter(isTransfer);
    const endpoints = plan.endpoints.filter((entry) =>
      canonicalJourneyDay(entry.day) === day
    );
    const ordinal = journeyDayOrdinal(day);
    const add = (
      code: string,
      severity: FeasibilityIssue["severity"],
      message: string,
      detail?: Record<string, unknown>,
    ) =>
      issues.push({
        code,
        severity,
        day,
        message,
        ...(detail ? { detail } : {}),
      });

    if (
      ctx.plannedDate && validIsoDate(ctx.plannedDate) && ordinal &&
      finite(ctx.now)
    ) {
      const midnight = Date.parse(`${ctx.plannedDate.trim()}T00:00:00+08:00`) +
        (ordinal - 1) * 86400000;
      for (const item of rows) {
        const start = itineraryMinutes(item.timeStart);
        if (
          start != null &&
          midnight + start * 60000 < ctx.now + DEPARTURE_BUFFER_MINUTES * 60000
        ) {
          add(
            "past_departure",
            "blocker",
            `“${item.title}”的开始时间已过或不足一小时，请调整日期或时间。`,
            {
              title: item.title,
              startAt: new Date(midnight + start * 60000).toISOString(),
            },
          );
        }
      }
    }

    const estimates: Record<string, unknown>[] = [];
    let estimatedHours = 0, estimateComplete = endpoints.length > 0;
    const estimatedRouteIds = new Set<string>();
    for (const endpoint of endpoints) {
      const route = routeFor(endpoint, hikes, plan, ctx.research);
      const id = route?.routeId ?? endpoint.routeId ?? plan.journey?.routeId;
      const distance = endpointDistance(endpoint, route),
        point = endpointPoint(endpoint, route);
      const previous = id ? previousEndpoints.get(id) : undefined;
      // A route's start is distance zero only when the research records it.
      const origin = route?.waypoints.find((entry) => entry.distanceKm === 0);
      const startDistance = previous
        ? previous.distance
        : origin?.distanceKm ?? null;
      const startPoint = previous ? previous.point : origin;
      if (
        !id || distance == null || startDistance == null ||
        distance < startDistance || estimatedRouteIds.has(id)
      ) {
        estimateComplete = false;
      } else {
        const startAscent = cumulativeAscent(startPoint),
          endAscent = cumulativeAscent(point);
        const ascent =
          startAscent != null && endAscent != null && endAscent >= startAscent
            ? endAscent - startAscent
            : null;
        const km = distance - startDistance;
        estimatedHours += km / HIKING_KM_PER_HOUR +
          (ascent == null ? 0 : ascent / ASCENT_METERS_PER_HOUR);
        estimatedRouteIds.add(id);
        estimates.push({
          routeId: id,
          distanceKm: km,
          ascentMeters: ascent,
          estimated: true,
        });
      }
      if (id) previousEndpoints.set(id, { distance, point });
    }
    const explicitHiking = hikes.map(duration);
    const allHikingTimed = hikes.length > 0 &&
      explicitHiking.every((value) => value != null);
    const routeIds = new Set(
      hikes.map((item) => item.routeId).filter((id): id is string => !!id),
    );
    const estimateCoversRoutes = [...routeIds].every((id) =>
      estimatedRouteIds.has(id)
    );
    const usedEstimate = !allHikingTimed && estimateComplete &&
      estimateCoversRoutes;
    const hikingHours = allHikingTimed
      ? explicitHiking.reduce<number>((sum, value) => sum + value!, 0)
      : usedEstimate
      ? estimatedHours
      : hikes.length
      ? (explicitHiking.some((value) => value != null)
        ? explicitHiking.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null)
      : endpoints.length
      ? null
      : 0;

    let transferHours: number | null = transfers.length ? null : 0;
    const counted = new Set<unknown>();
    let transferComplete = true;
    for (const item of transfers) {
      const segments = matchingSegments(item, ctx.transportPlan);
      const legs = matchingLegs(item, plan);
      // An arrival point is a marker, not a second duration-unknown journey.
      const timed = duration(item) ?? (item.location?.incomingMode ? 0 : null);
      const knownSegments = segments.filter((segment) =>
        segment.mode !== "unknown" && finite(segment.durationMinutes)
      );
      const references = [...segments, ...legs];
      let hours = timed;
      if (
        hours == null && knownSegments.length === segments.length &&
        segments.length
      ) {
        hours = knownSegments.reduce(
          (sum, segment) =>
            sum + (counted.has(segment) ? 0 : segment.durationMinutes! / 60),
          0,
        );
      } else if (hours == null && legs.length) {
        hours = legs.reduce(
          (sum, leg) =>
            sum + (counted.has(leg) ? 0 : (leg.arrival - leg.departure) / 60),
          0,
        );
      }
      references.forEach((reference) => counted.add(reference));
      if (hours != null) transferHours = (transferHours ?? 0) + hours;
      else transferComplete = false;
      const differentRoute = segments.some((segment) =>
        !same(segment.fromRoute, segment.toRoute)
      ) || (ctx.research?.routes ?? []).some((route) =>
        route.routeId && routeIds.size > 0 && !routeIds.has(route.routeId) &&
        (same(item.location?.trackId, route.routeId) ||
          same(item.location?.name, route.start?.name) ||
          key(item.title).includes(key(route.name)) &&
            /起点|进山|入口/.test(item.title))
      );
      const crossRegion =
        /路线间|跨城|异地|跨(?:区|地区|区域)|长途/.test(item.title) ||
        LONG_DISTANCE.test(item.title) && !item.location?.incomingMode;
      const unknownSegment = segments.some((segment) =>
        segment.mode === "unknown" || segment.durationMinutes == null
      );
      if (
        (hikes.length || endpoints.length) && (differentRoute || crossRegion) &&
        (unknownSegment || hours == null)
      ) {
        if (
          !issues.some((issue) =>
            issue.day === day && issue.code === "unknown_same_day_transfer"
          )
        ) {
          add(
            "unknown_same_day_transfer",
            "warning",
            "当天既安排徒步，又需跨路线或异地接驳，耗时未知，能否同日完成需确认。",
          );
        }
      }
      if (LONG_DISTANCE.test(item.title) || item.location?.incomingMode) {
        longDistanceDays.add(day);
      }
    }
    if (routeIds.size > 1) {
      add(
        "multi_route_same_day",
        "warning",
        "同一天安排了两条以上路线的徒步，请核对接驳和时间。",
        { routeIds: [...routeIds] },
      );
    }
    const total = (hikingHours ?? 0) + (transferHours ?? 0);
    if (total > DAILY_LOAD_WARNING_HOURS) {
      add(
        "daily_load",
        total > DAILY_LOAD_BLOCKER_HOURS ? "blocker" : "warning",
        `当天徒步和交通合计${
          Math.round(total * 10) / 10
        }小时，安排过重，请减少行程。`,
        {
          hikingHours,
          transferHours,
          totalHours: total,
          estimated: usedEstimate,
          estimates: usedEstimate ? estimates : [],
          incomplete: !transferComplete ||
            (hikingHours !== 0 && !allHikingTimed && !usedEstimate),
        },
      );
    }

    const endpoint = endpoints.at(-1);
    const route = endpoint
      ? routeFor(endpoint, hikes, plan, ctx.research)
      : undefined;
    const point = endpoint ? endpointPoint(endpoint, route) : undefined;
    const endpointName = endpoint?.locationName ?? point?.name ?? null;
    const stay = rows.findLast((item) => item.kind === "stay");
    const lastHike = rows.findLastIndex((item) => item.kind === "activity");
    const laterTransfers = transfers.filter((item) => {
      const hike = rows[lastHike];
      const start = itineraryMinutes(item.timeStart),
        finish = itineraryMinutes(hike?.timeEnd);
      return start != null && finish != null
        ? start >= finish
        : rows.indexOf(item) > lastHike;
    });
    const camp = !!endpointName && LODGING.test(endpointName);
    const finalLocated = rows.findLast((item) => !!item.location);
    let sleepLocation = stay?.location?.name ?? stay?.title ?? null;
    if (!sleepLocation) {
      sleepLocation = laterTransfers.length
        ? finalLocated?.location?.name ?? null
        : camp
        ? endpointName
        : finalLocated?.location?.name ?? null;
    }
    const sleepsAtEndpoint = !!point && !!sleepLocation &&
      !laterTransfers.length &&
      (same(sleepLocation, endpointName) || same(sleepLocation, point.name) ||
        !!stay && !stay.location && key(stay.title).includes(key(point.name)));
    const sleepElevationMeters =
      sleepsAtEndpoint && finite(point?.elevationMeters)
        ? point.elevationMeters
        : null;
    if (
      day !== labels.at(-1) && endpoint && !stay && !camp &&
      !laterTransfers.length
    ) {
      add(
        "missing_overnight",
        "warning",
        `徒步在${endpointName ?? "路线终点"}结束，但当晚过夜地点未安排。`,
      );
    }
    const previousNight = days.at(-1);
    const consecutive = ordinal != null &&
      journeyDayOrdinal(previousNight?.day ?? "") === ordinal - 1;
    const previousElevation = consecutive
      ? previousNight?.sleepElevationMeters ?? null
      : null;
    const high = sleepElevationMeters != null &&
      sleepElevationMeters > HIGH_SLEEP_ELEVATION_METERS;
    const fastGain = high && previousElevation != null &&
      sleepElevationMeters - previousElevation > SLEEP_ELEVATION_GAIN_METERS;
    const firstHighAfterLow = high && !seenHighNight && consecutive &&
      ((previousElevation != null &&
        previousElevation < LOW_SLEEP_ELEVATION_METERS) ||
        longDistanceDays.has(previousNight!.day));
    if (fastGain || firstHighAfterLow) {
      add(
        "sleeping_altitude",
        "warning",
        "当晚过夜海拔较高且上升较快，建议预留适应时间。",
        {
          heuristic: true,
          sleepElevationMeters,
          previousSleepElevationMeters: previousElevation,
          basis: fastGain
            ? "nightly_elevation_gain"
            : "first_high_night_after_long_distance_travel",
        },
      );
    }
    if (high) seenHighNight = true;
    days.push({
      day,
      hikingHours,
      transferHours,
      sleepLocation,
      sleepElevationMeters,
    });
  }
  return { issues, days };
}
