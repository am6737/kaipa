const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Convert agent-facing HH:mm values to the timeline's minutes-from-midnight format. */
export function itineraryMinutes(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 1439 ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}
