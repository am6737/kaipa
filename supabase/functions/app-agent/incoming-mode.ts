/** `location.incomingMode`: how the traveller arrives at the row's own place. */
export const incomingModes = ['rail', 'flight', 'road'] as const;
export type IncomingMode = typeof incomingModes[number];

/** Rail and flight land at the journey's travel hub, a row the server's hub
 * chain owns and may replace with a queried service; `road` (包车、拼车、班车、
 * 景区观光车、出租、网约车、自驾) is a local leg the plan keeps as its own stop. */
export function isHubIncomingMode(mode: unknown): mode is 'rail' | 'flight' {
  return mode === 'rail' || mode === 'flight';
}
