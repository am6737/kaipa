import type { MapCoordinate } from './types';

export interface WaypointCluster {
  /** Original waypoint indices, so list numbering and selection stay intact. */
  indices: number[];
  /** A real member coordinate; never an average floating off the track. */
  coordinate: MapCoordinate;
}

/** Group nearby annotations in map pixels without changing the track geometry.
 * Fixed anchors prevent a chain of close points from swallowing a whole route.
 * A spatial grid keeps the work bounded even for files with many waypoints.
 */
export function clusterWaypoints(coordinates: MapCoordinate[], zoom: number, radius = 52): WaypointCluster[] {
  if (!coordinates.length) return [];
  const worldSize = 256 * 2 ** Math.max(0, Math.min(22, zoom));
  const reference = coordinates[0][0];
  const positions = coordinates.map(([longitude, latitude]) => {
    const wrappedLongitude = ((longitude - reference + 180) % 360 + 360) % 360 - 180;
    const lat = Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180;
    return { x: wrappedLongitude / 360 * worldSize, y: -Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI) * worldSize };
  });
  const groups: { indices: number[]; anchor: { x: number; y: number }; sumX: number; sumY: number }[] = [];
  const grid = new Map<string, number[]>();
  positions.forEach((position, index) => {
    const cellX = Math.floor(position.x / radius);
    const cellY = Math.floor(position.y / radius);
    let best = -1;
    let nearest = radius * radius;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const candidate of grid.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          const anchor = groups[candidate].anchor;
          const distance = (position.x - anchor.x) ** 2 + (position.y - anchor.y) ** 2;
          if (distance <= nearest) { nearest = distance; best = candidate; }
        }
      }
    }
    if (best >= 0) {
      const group = groups[best];
      group.indices.push(index);
      group.sumX += position.x;
      group.sumY += position.y;
    } else {
      const key = `${cellX}:${cellY}`;
      const members = grid.get(key) ?? [];
      members.push(groups.length);
      grid.set(key, members);
      groups.push({ indices: [index], anchor: position, sumX: position.x, sumY: position.y });
    }
  });
  return groups.map((group) => {
    const x = group.sumX / group.indices.length;
    const y = group.sumY / group.indices.length;
    let representative = group.indices[0];
    let nearest = Infinity;
    for (const index of group.indices) {
      const position = positions[index];
      const distance = (position.x - x) ** 2 + (position.y - y) ** 2;
      if (distance < nearest) { nearest = distance; representative = index; }
    }
    return { indices: group.indices, coordinate: coordinates[representative] };
  });
}
