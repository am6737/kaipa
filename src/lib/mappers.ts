import type { Poi, Companion } from '../data/pois';
import type { GearCat, GearItem, GearSet } from '../data/gear';
import type { Notif } from '../data/notifications';
import type { TLRow, TLMedia } from '../data/timeline';
import type { InspoMedia } from '../data/inspoStore';

export function toRoutePoi(r: any): Poi {
  return {
    id: r.id,
    kind: 'route',
    name: r.name,
    region: r.region,
    coord: r.coord ?? '',
    lng: r.lng,
    lat: r.lat,
    dist: r.dist ?? '',
    asc: r.asc ?? '',
    diff: r.diff,
    rating: r.rating,
    reviews: r.reviews,
    tone: r.tone,
    desc: r.desc,
    trackCoords: r.track_coords,
    trackElevation: r.track_elevation,
    trackDurationMs: r.track_duration_ms,
    trackWaypoints: r.track_waypoints,
    photoUris: r.photo_uris,
  };
}

export function toJourneyPoi(j: any, companions?: any[]): Poi {
  const list: Companion[] = (companions ?? j.companions ?? []).map((c: any) => ({
    ini: c.ini,
    name: c.name,
    role: c.role ?? undefined,
    color: c.color,
    tone: c.tone ?? undefined,
    trips: c.trips ?? undefined,
    host: c.is_host ?? false,
    self: c.is_self ?? false,
  }));

  return {
    id: j.id,
    kind: 'journey',
    name: j.name,
    region: j.region,
    coord: j.coord ?? '',
    lng: j.lng,
    lat: j.lat,
    dist: j.dist ?? '',
    asc: j.asc ?? '',
    diff: j.diff,
    tone: j.tone,
    mine: true,
    desc: j.desc,
    status: j.status,
    date: j.date,
    days: j.days,
    plannedDate: j.planned_date,
    countdown: j.countdown,
    dayIndex: j.day_index,
    totalDays: j.total_days,
    fav: j.fav ?? false,
    routeId: j.route_id,
    companions: list.length,
    companionList: list,
    trackCoords: j.track_coords,
    trackElevation: j.track_elevation,
    trackDurationMs: j.track_duration_ms,
    trackWaypoints: j.track_waypoints,
    photoUris: j.photo_uris,
  };
}

export function toGearCat(r: any): GearCat {
  return { id: r.id, name: r.name, color: r.color, builtin: r.builtin };
}

export function toGearItem(r: any): GearItem {
  return {
    id: r.id,
    name: r.name,
    cat: r.cat_id,
    w: r.weight,
    p: r.price,
    qty: r.qty ?? 1,
    attrs: r.attrs,
    note: r.note,
  };
}

export function toGearSet(r: any, itemNames: string[]): GearSet {
  return { id: r.id, name: r.name, items: itemNames };
}

export function toNotif(r: any): Notif {
  return {
    id: r.id,
    kind: r.kind,
    cat: r.cat,
    bucket: r.bucket,
    time: r.time,
    who: r.who,
    avatar: r.avatar,
    color: r.color,
    verb: r.verb,
    target: r.target,
    targetId: r.target_id,
    action: r.action,
    thumb: r.thumb,
    read: r.read ?? false,
  };
}

export function toTLRow(r: any): TLRow {
  return {
    id: r.id,
    title: r.title,
    day: r.day,
    media: r.media as TLMedia[] | undefined,
    synth: r.is_synth ?? false,
    custom: r.is_custom ?? false,
    checked: r.checked ?? false,
  };
}

export function toInspoMedia(r: any): InspoMedia {
  return {
    id: r.id,
    uri: r.uri,
    kind: r.kind,
    thumbnail: r.thumbnail ?? undefined,
    duration: r.duration ?? undefined,
    pairedVideoUri: r.paired_video_uri ?? undefined,
  };
}
