import {
  type Waypoint,
  isWaypointCurated,
  waypointHighlighted,
  waypointPhoto,
} from './route-waypoints'

// A replaced file re-numbers the waypoints, so a curated spot is recognised by
// its name and distance first, and only then by how close it sits on the map.
const NAME_KM_TOLERANCE = 0.3
const COORD_METERS_TOLERANCE = 150

const trimmedName = (waypoint: Waypoint) =>
  typeof waypoint.name === 'string' ? waypoint.name.trim() : ''

const kmOf = (waypoint: Waypoint) => {
  const km = typeof waypoint.km === 'number' ? waypoint.km : Number(waypoint.km)
  return Number.isFinite(km) ? km : null
}

const coordOf = (waypoint: Waypoint) => {
  const lng =
    typeof waypoint.lng === 'number' ? waypoint.lng : Number(waypoint.lng)
  const lat =
    typeof waypoint.lat === 'number' ? waypoint.lat : Number(waypoint.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lng, lat }
}

// Great-circle distance; waypoints are far enough apart that a sphere is exact.
function metersBetween(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(h))
}

export type WaypointMerge = {
  waypoints: Waypoint[]
  // Curated waypoints from the old list that no new waypoint matched.
  lost: Waypoint[]
}

/**
 * Carries `photo` and `highlight` from the stored waypoint list onto a freshly
 * parsed one, so re-uploading a track does not discard the curation.
 */
export function mergeWaypointCuration(
  next: Waypoint[],
  previous: Waypoint[]
): WaypointMerge {
  const curated = previous.filter(isWaypointCurated)
  const matched = new Map<number, number>()
  const taken = new Set<number>()
  const takenCandidates = new Set<number>()

  curated.forEach((candidate, candidateIndex) => {
    const name = trimmedName(candidate)
    const km = kmOf(candidate)
    if (!name || km == null) return
    let best = -1
    let bestKm = Infinity
    next.forEach((waypoint, index) => {
      if (taken.has(index)) return
      const candidateKm = kmOf(waypoint)
      if (
        trimmedName(waypoint) === name &&
        candidateKm != null &&
        Math.abs(candidateKm - km) <= NAME_KM_TOLERANCE &&
        Math.abs(candidateKm - km) < bestKm
      ) {
        best = index
        bestKm = Math.abs(candidateKm - km)
      }
    })
    if (best >= 0) {
      matched.set(best, candidateIndex)
      takenCandidates.add(candidateIndex)
      taken.add(best)
    }
  })

  curated.forEach((candidate, candidateIndex) => {
    if (takenCandidates.has(candidateIndex)) return
    const coord = coordOf(candidate)
    if (!coord) return
    let best = -1
    let bestMeters = Infinity
    next.forEach((waypoint, index) => {
      if (taken.has(index)) return
      const waypointCoord = coordOf(waypoint)
      if (!waypointCoord) return
      const meters = metersBetween(coord, waypointCoord)
      if (meters <= COORD_METERS_TOLERANCE && meters < bestMeters) {
        best = index
        bestMeters = meters
      }
    })
    if (best >= 0) {
      matched.set(best, candidateIndex)
      takenCandidates.add(candidateIndex)
      taken.add(best)
    }
  })

  const waypoints = next.map((waypoint, index) => {
    const candidateIndex = matched.get(index)
    if (candidateIndex == null) return waypoint
    const matchedWaypoint = curated[candidateIndex]
    const merged: Waypoint = { ...waypoint }
    const photo = waypointPhoto(matchedWaypoint)
    if (photo) merged.photo = photo
    else delete merged.photo
    if (waypointHighlighted(matchedWaypoint)) merged.highlight = true
    else delete merged.highlight
    return merged
  })

  return {
    waypoints,
    lost: curated.filter((_, index) => !takenCandidates.has(index)),
  }
}
