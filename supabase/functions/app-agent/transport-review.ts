export type TransportLeg = {
  from: string;
  to: string;
  mode: 'rail' | 'flight' | 'bus' | 'shuttle' | 'taxi' | 'carpool' | 'self_drive' | 'walk';
  departure: number;
  arrival: number;
  bufferBefore: number;
  verified: boolean;
  sourceUrl: string | null;
  fallback: string | null;
};

export type TransportPlan = {
  direction: 'outbound' | 'return' | 'round_trip';
  origin: string | null;
  returnDestination: string | null;
  trailStart: string;
  trailFinish: string;
  hikeStart: number;
  hikeEnd: number;
  arrivalBuffer: number;
  departureBuffer: number;
  outbound: TransportLeg[];
  inbound: TransportLeg[];
  vehicleRetrieval: string | null;
};

export function reviewTransportPlan(plan: TransportPlan) {
  const issues: string[] = [];
  const unverified: string[] = [];
  const samePlace = (a: string | null, b: string | null) => Boolean(a?.trim() && b?.trim() && a.trim() === b.trim());
  if (plan.hikeEnd <= plan.hikeStart) issues.push('The saved hiking window must end after it starts.');
  if (plan.arrivalBuffer < 0 || plan.departureBuffer < 0) issues.push('Hiking connection buffers cannot be negative.');

  const check = (legs: TransportLeg[], from: string | null, to: string | null, name: string) => {
    if (!from || !to) issues.push(`${name}: confirm the required departure and arrival places.`);
    if (!legs.length) { issues.push(`${name}: missing transport chain.`); return; }
    if (!samePlace(legs[0].from, from)) issues.push(`${name}: chain does not start at the selected departure place.`);
    if (!samePlace(legs.at(-1)!.to, to)) issues.push(`${name}: missing final-mile connection to the selected arrival place.`);
    legs.forEach((leg, index) => {
      const label = `${name} ${index + 1}: ${leg.from} -> ${leg.to}`;
      if (leg.arrival <= leg.departure || leg.bufferBefore < 0) issues.push(`${label}: invalid time range or buffer.`);
      if (index) {
        const previous = legs[index - 1];
        if (!samePlace(previous.to, leg.from)) issues.push(`${label}: missing physical transfer from ${previous.to}.`);
        if (leg.departure < previous.arrival + leg.bufferBefore) issues.push(`${label}: insufficient connection time.`);
      }
      if (!leg.verified || !leg.sourceUrl || !/^https?:\/\//i.test(leg.sourceUrl)) unverified.push(`${label}: service/time/availability needs verification.`);
      if (leg.mode === 'carpool' && !leg.fallback?.trim()) issues.push(`${label}: provide a fallback if the carpool does not form.`);
    });
  };

  if (plan.direction !== 'return') {
    check(plan.outbound, plan.origin, plan.trailStart, 'Outbound');
    if (plan.outbound.length && plan.outbound.at(-1)!.arrival + plan.arrivalBuffer > plan.hikeStart) {
      issues.push('Outbound arrives too late for the saved hike. Compare prior-evening arrival; do not move the hike without consent.');
    }
  } else if (plan.outbound.length) issues.push('Return-only request must not add outbound travel.');
  if (plan.direction !== 'outbound') {
    check(plan.inbound, plan.trailFinish, plan.returnDestination, 'Return');
    if (plan.inbound.length && plan.inbound[0].departure < plan.hikeEnd + Math.max(plan.departureBuffer, plan.inbound[0].bufferBefore)) {
      issues.push('Return departs too early after the saved hike and delay buffer.');
    }
  } else if (plan.inbound.length) issues.push('Outbound-only request must not add return travel.');
  if ([...plan.outbound, ...plan.inbound].some(leg => leg.mode === 'self_drive')
    && !samePlace(plan.trailStart, plan.trailFinish) && !plan.vehicleRetrieval?.trim()) {
    issues.push('Point-to-point self-drive requires a vehicle-retrieval arrangement.');
  }
  return { consistent: issues.length === 0, issues, unverified, requiresExtraTravelDay: [...plan.outbound, ...plan.inbound].some(leg => leg.departure < 0 || leg.arrival >= (Math.floor(plan.hikeEnd / 1440) + 1) * 1440),
    limitation: 'Checks supplied route/time consistency only, not source reliability, live availability or permission to change dates.' };
}
