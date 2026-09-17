export type AgentLocation =
  | { status: 'available'; latitude: number; longitude: number; accuracy: number | null; timestamp: number; coordinateSystem: 'WGS84'; placeName?: string }
  | { status: 'permission_required' | 'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable' | 'stale' };

export function normalizeAgentLocation(value: unknown, now = Date.now()): AgentLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  if (data.status !== 'available') {
    return ['permission_required', 'permission_denied', 'services_disabled', 'timeout', 'unavailable', 'stale'].includes(String(data.status))
      ? { status: data.status as Exclude<AgentLocation['status'], 'available'> }
      : undefined;
  }
  const { latitude, longitude, accuracy, timestamp } = data;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || typeof timestamp !== 'number' || !Number.isFinite(timestamp)
    || data.coordinateSystem !== 'WGS84'
    || (accuracy !== null && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0))) {
    return { status: 'unavailable' };
  }
  if (now - timestamp > 5 * 60_000 || timestamp > now + 60_000) return { status: 'stale' };
  const placeName = typeof data.placeName === 'string' ? data.placeName.trim().slice(0, 200) : '';
  return { status: 'available', latitude, longitude, accuracy: accuracy as number | null, timestamp, coordinateSystem: 'WGS84', ...(placeName ? { placeName } : {}) };
}
