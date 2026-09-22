import { strFromU8, unzipSync } from 'fflate'

export type ParsedRouteTrack = {
  name: string
  dist: string
  asc_: string
  lng: string
  lat: string
  coord: string
  track_coords: string
  track_elevation: string
  track_duration_ms: string
  track_waypoints: string
}

type RawWaypoint = { name: string; coord: [number, number]; ele?: number }

function xmlText(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>\\s*(?:<!\\[CDATA\\[)?\\s*([^<\\]]+?)\\s*(?:\\]\\]>)?\\s*</${tag}>`, 'i'))
  return match?.[1]?.trim() || ''
}

function fileStem(filename: string) {
  // Browsers normally provide only the basename, but stripping a possible
  // path keeps the fallback useful for mocked File objects and imports.
  const basename = filename.split(/[\\/]/).pop()?.trim() || ''
  return basename.replace(/\.(gpx|kml|kmz)$/i, '').trim()
}

async function readText(file: File, extension: string) {
  if (extension !== 'kmz') return file.text()
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const entry = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith('.kml'))
  if (!entry) throw new Error('KMZ 文件中未找到 KML 轨迹')
  return strFromU8(entry[1])
}

export async function parseRouteTrack(file: File): Promise<ParsedRouteTrack> {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!['gpx', 'kml', 'kmz'].includes(extension)) throw new Error('只支持 GPX、KML、KMZ 文件')
  // KML exports commonly use namespaced elements such as <gx:Track>/<gx:coord>.
  // The parser matches the local element names, so normalize those prefixes first.
  const xml = (await readText(file, extension))
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(\/?)[\w.-]+:/g, '<$1')
  const points: Array<[number, number]> = []
  const pointElevations: Array<number | undefined> = []
  const rawWaypoints: RawWaypoint[] = []
  const times: number[] = []
  const isKml = extension !== 'gpx' || /<kml[\s>]/i.test(xml)
  if (isKml) {
    const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi
    let placemark: RegExpExecArray | null
    while ((placemark = placemarkRe.exec(xml))) {
      const block = placemark[1]
      if (!/<Point\b/i.test(block)) continue
      const name = xmlText(block, 'name')
      const coord = block.match(/<Point\b[\s\S]*?<coordinates\b[^>]*>\s*([-\d.eE+]+),([-\d.eE+]+)(?:,([-\d.eE+]+))?\s*<\/coordinates>/i)
      if (!name || !coord) continue
      const lon = Number(coord[1]); const lat = Number(coord[2]); const ele = Number(coord[3])
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        rawWaypoints.push({ name, coord: [lon, lat], ele: Number.isFinite(ele) ? ele : undefined })
      }
    }
    // KML exports may contain marker <Point><coordinates> alongside the
    // actual gx:Track. Prefer the track's gx:coord elements so markers do
    // not become spurious jumps in the rendered line.
    const coordRe = /<coord\b[^>]*>\s*([\s\S]*?)\s*<\/coord>/gi
    let match: RegExpExecArray | null
    while ((match = coordRe.exec(xml))) {
      const [lon, lat, ele] = match[1].trim().split(/[\s\n\r]+/).map(Number)
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        points.push([lon, lat])
        pointElevations.push(Number.isFinite(ele) ? ele : undefined)
      }
    }
    // Plain KML without gx:Track: only read coordinates inside LineString,
    // never marker Point coordinates elsewhere in the document.
    if (!points.length) {
      const lineRe = /<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>\s*([\s\S]*?)\s*<\/coordinates>[\s\S]*?<\/LineString>/gi
      while ((match = lineRe.exec(xml))) {
        for (const token of match[1].trim().split(/[\s\n\r]+/)) {
          const [lon, lat, ele] = token.split(',').map(Number)
          if (Number.isFinite(lon) && Number.isFinite(lat)) {
            points.push([lon, lat])
            pointElevations.push(Number.isFinite(ele) ? ele : undefined)
          }
        }
      }
    }
  } else {
    const re = /<(?:trkpt|rtept)\b([^>]*?)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(xml))) {
      const lat = Number(match[1].match(/lat=["']([^"']+)/i)?.[1])
      const lon = Number(match[1].match(/lon=["']([^"']+)/i)?.[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      points.push([lon, lat])
      const ele = Number(xmlText(match[2], 'ele'))
      pointElevations.push(Number.isFinite(ele) ? ele : undefined)
      const time = Date.parse(xmlText(match[2], 'time'))
      if (Number.isFinite(time)) times.push(time)
    }
  }
  if (points.length < 2) throw new Error('未解析出至少两个轨迹点，请检查文件内容')
  const distance = (a: [number, number], b: [number, number]) => {
    const rad = Math.PI / 180
    const dLat = (b[1] - a[1]) * rad
    const dLon = (b[0] - a[0]) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
    return 6371000 * 2 * Math.asin(Math.sqrt(h))
  }
  let meters = 0
  const cumulativeMeters = [0]
  for (let i = 1; i < points.length; i++) meters += distance(points[i - 1], points[i])
  for (let i = 1; i < points.length; i++) cumulativeMeters.push(cumulativeMeters[i - 1] + distance(points[i - 1], points[i]))
  const elevations: Array<{ km: number; ele: number }> = []
  for (let i = 0; i < pointElevations.length; i++) {
    const ele = pointElevations[i]
    if (Number.isFinite(ele)) elevations.push({ km: cumulativeMeters[i] / 1000, ele: ele as number })
  }
  let ascent = 0
  for (let i = 1; i < elevations.length; i++) ascent += Math.max(0, elevations[i].ele - elevations[i - 1].ele)
  const waypoints = rawWaypoints.map((waypoint) => {
    let bestIndex = 0
    let bestDistance = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = distance(waypoint.coord, points[i])
      if (d < bestDistance) { bestDistance = d; bestIndex = i }
    }
    let cumulativeAscent = 0
    let cumulativeDescent = 0
    let previousElevation: number | undefined
    for (let i = 0; i <= bestIndex; i++) {
      const current = pointElevations[i]
      if (!Number.isFinite(current)) continue
      if (previousElevation != null) {
        const delta = (current as number) - previousElevation
        if (delta > 0) cumulativeAscent += delta
        else cumulativeDescent -= delta
      }
      previousElevation = current as number
    }
    return {
      name: waypoint.name,
      km: cumulativeMeters[bestIndex] / 1000,
      distanceFromTrackMeters: bestDistance,
      elevationMeters: Number.isFinite(pointElevations[bestIndex]) ? pointElevations[bestIndex] : null,
      cumulativeAscentMeters: previousElevation != null ? Math.round(cumulativeAscent) : null,
      cumulativeDescentMeters: previousElevation != null ? Math.round(cumulativeDescent) : null,
    }
  }).sort((a, b) => a.km - b.km)
  const name = xmlText(xml, 'name') || fileStem(file.name) || '未命名轨迹'
  return {
    name,
    dist: `${(meters / 1000).toFixed(1)} km`,
    asc_: elevations.length > 1 ? `+${Math.round(ascent)} m` : '',
    lng: points[0][0].toFixed(6),
    lat: points[0][1].toFixed(6),
    coord: `${points[0][1].toFixed(4)} N · ${points[0][0].toFixed(4)} E`,
    track_coords: JSON.stringify(points),
    track_elevation: JSON.stringify(elevations),
    track_duration_ms: times.length > 1 ? String(Math.max(0, times[times.length - 1] - times[0])) : '',
    track_waypoints: JSON.stringify(waypoints),
  }
}
