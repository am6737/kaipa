export type Coordinate = [number, number];

const PI = Math.PI;
const AXIS = 6378245;
const ECCENTRICITY = 0.006693421622965943;

export function isInsideMainlandChina([lng, lat]: Coordinate): boolean {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function latitudeOffset(lng: number, lat: number): number {
  let value = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  value += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3;
  value += ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) / 3;
  return value;
}

function longitudeOffset(lng: number, lat: number): number {
  let value = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3;
  value += ((20 * Math.sin(lng * PI) + 40 * Math.sin((lng / 3) * PI)) * 2) / 3;
  value += ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) / 3;
  return value;
}

export function wgs84ToGcj02(coordinate: Coordinate): Coordinate {
  if (!isInsideMainlandChina(coordinate)) return coordinate;
  const [lng, lat] = coordinate;
  let dLat = latitudeOffset(lng - 105, lat - 35);
  let dLng = longitudeOffset(lng - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
  if (!isInsideMainlandChina(coordinate)) return coordinate;
  let estimate: Coordinate = coordinate;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const converted = wgs84ToGcj02(estimate);
    estimate = [
      estimate[0] + coordinate[0] - converted[0],
      estimate[1] + coordinate[1] - converted[1],
    ];
  }
  return estimate;
}
