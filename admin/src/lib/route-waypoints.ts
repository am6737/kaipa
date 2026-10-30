// Waypoints of `routes.track_waypoints`, shared with the mobile app.
// The stored array stays in walking order; the console must never reorder,
// drop or rename an entry, so unknown keys are carried through untouched.
export type Waypoint = Record<string, unknown>

const asText = (value: unknown) => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export function waypointName(waypoint: Waypoint) {
  return asText(waypoint.name)
}

export function waypointKm(waypoint: Waypoint) {
  return asNumber(waypoint.km)
}

// Tracks recorded in the app store `ele`; files parsed by the console store
// `elevationMeters`. Both are metres above sea level.
export function waypointEle(waypoint: Waypoint) {
  return asNumber(waypoint.ele ?? waypoint.elevationMeters)
}

export function waypointPhoto(waypoint: Waypoint) {
  const photo = asText(waypoint.photo).trim()
  return photo ? photo : null
}

export function waypointHighlighted(waypoint: Waypoint) {
  return waypoint.highlight === true
}

export function isWaypointCurated(waypoint: Waypoint) {
  return waypointHighlighted(waypoint) || waypointPhoto(waypoint) != null
}

export function withHighlight(
  waypoint: Waypoint,
  highlighted: boolean
): Waypoint {
  const next: Waypoint = { ...waypoint }
  if (highlighted) next.highlight = true
  else delete next.highlight
  return next
}

export function withPhoto(waypoint: Waypoint, photo: string | null): Waypoint {
  const next: Waypoint = { ...waypoint }
  const url = photo?.trim()
  if (url) next.photo = url
  else delete next.photo
  return next
}

// Accepts the jsonb array, a JSON string of it, or null from a route that was
// never curated. Anything that is not a waypoint object is skipped rather than
// written back.
export function parseWaypoints(value: unknown): Waypoint[] {
  let list = value
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.filter(
    (item): item is Waypoint =>
      item != null && typeof item === 'object' && !Array.isArray(item)
  )
}

// Writes the array back under the contract: `photo` only as a non-empty URL,
// `highlight` only as true, every other key exactly as it arrived.
export function serializeWaypoints(list: Waypoint[]): string {
  const cleaned = list.map((waypoint) => {
    const next: Waypoint = { ...waypoint }
    if (!waypointHighlighted(next)) delete next.highlight
    const photo = waypointPhoto(next)
    if (photo) next.photo = photo
    else delete next.photo
    return next
  })
  return JSON.stringify(cleaned)
}
