import {
  DEFAULT_JOURNEY_PARTICIPANT_PERMISSIONS,
  type Poi,
  type Companion,
} from "../data/pois";
import type { GearCat, GearItem, GearSet, GearSetOverride } from "../data/gear";
import type { Notif } from "../data/notifications";
import type { TLRow, TLMedia } from "../data/timeline";
import type { InspoMedia } from "../data/inspoStore";
import type { Track } from "../data/tracks";

export function toRoutePoi(r: any): Poi {
  return {
    id: r.id,
    kind: "route",
    name: r.name,
    region: r.region,
    coord: r.coord ?? "",
    lng: r.lng,
    lat: r.lat,
    dist: r.dist ?? "",
    asc: r.asc ?? "",
    diff: r.diff,
    rating: r.rating,
    reviews: r.reviews,
    tone: r.tone,
    desc: r.desc,
    photoUris: r.photo_uris,
    trackCoords: r.track_coords ?? undefined,
    trackElevation: r.track_elevation ?? undefined,
    trackDurationMs: r.track_duration_ms ?? undefined,
    trackWaypoints: r.track_waypoints ?? undefined,
    trackFileUrl: r.track_file_url ?? undefined,
    trackFileName: r.track_file_name ?? undefined,
    bestMonths: r.best_months ?? undefined,
    seasonNote: r.season_note ?? undefined,
  };
}

export function toJourneyPoi(j: any, companions?: any[], viewerUserId?: string): Poi {
  const list: Companion[] = (companions ?? j.companions ?? []).map(
    (c: any) => ({
      id: c.id ?? undefined,
      userId: c.user_id ?? undefined,
      ini: c.ini,
      name: c.name,
      role: c.role ?? undefined,
      color: c.color,
      tone: c.tone ?? undefined,
      avatarUrl: c.avatar_url ?? undefined,
      trips: c.trips ?? undefined,
      host: c.is_host ?? false,
      self: c.user_id && viewerUserId ? c.user_id === viewerUserId : c.is_self ?? false,
    }),
  );

  return {
    id: j.id,
    kind: "journey",
    name: j.name,
    region: j.region,
    coord: j.coord ?? "",
    lng: j.lng,
    lat: j.lat,
    dist: j.dist ?? "",
    asc: j.asc ?? "",
    diff: j.diff,
    tone: j.tone,
    mine: j.mine ?? true,
    desc: j.desc,
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
    participantPermissions: {
      ...DEFAULT_JOURNEY_PARTICIPANT_PERMISSIONS,
      ...(j.participant_permissions ?? {}),
    },
    trackId: j.track_id ?? undefined,
    ...trackProjection(j.tracks ? toTrack(j.tracks) : null),
    heroMode:
      j.hero_mode === "cover"
        ? "cover"
        : j.hero_mode === "track"
          ? "track"
          : undefined,
    trackPublic: j.track_public ?? false,
    routeShowPhotos: j.route_show_photos ?? true,
    routeShowTimeline: j.route_show_timeline ?? true,
    photoUris: j.photo_uris,
    deletedAt: j.deleted_at ?? undefined,
  };
}

/**
 * The Poi fields a journey reads off its track. Written once so a link the client
 * makes renders exactly like one read back from the server: the journey row only
 * stores `track_id`, so anything that sets it has to refresh this projection too.
 */
export function trackProjection(track: Track | null | undefined): Partial<Poi> {
  return {
    trackCoords: track?.coords ?? undefined,
    trackElevation: track?.elevation ?? undefined,
    trackDurationMs: track?.durationMs ?? undefined,
    trackWaypoints: track?.waypoints ?? undefined,
    trackFileUrl: track?.fileUrl ?? undefined,
    trackFileName: track?.fileName ?? undefined,
  };
}

export function toTrack(r: any): Track {
  return {
    id: r.id,
    name: r.name,
    fileName: r.file_name ?? undefined,
    fileFormat: r.file_format ?? undefined,
    fileUrl: r.file_url ?? undefined,
    fileSize: r.file_size ?? undefined,
    coords: r.coords ?? undefined,
    elevation: r.elevation ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    waypoints: r.waypoints ?? undefined,
    distM: r.dist_m ?? undefined,
    ascM: r.asc_m ?? undefined,
    pointCount: r.point_count ?? undefined,
    startedAt: r.started_at ?? undefined,
    createdAt: r.created_at ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

export function toGearCat(r: any): GearCat {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    builtin: r.builtin ?? false,
  };
}

export function toGearItem(r: any): GearItem {
  return {
    id: r.id,
    name: r.name,
    cat: r.cat_id ?? "uncat",
    w: r.weight,
    p: r.price,
    qty: r.qty ?? 1,
    status: r.status ?? "packed",
    photos: Array.isArray(r.photo_uris) ? r.photo_uris : undefined,
    attrs: r.attrs,
    note: r.note,
  };
}

export function toGearSet(
  r: any,
  itemNames: string[],
  overrides?: Record<string, GearSetOverride>,
): GearSet {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    items: itemNames,
    overrides:
      overrides && Object.keys(overrides).length ? overrides : undefined,
  };
}

export function toNotif(r: any): Notif {
  // Bucket notifications from their persisted timestamp. The legacy bucket
  // column is kept as a fallback for rows created before created_at existed.
  const createdAt = r.created_at ? new Date(r.created_at) : null;
  const today = new Date();
  const bucket: Notif['bucket'] = createdAt && !Number.isNaN(createdAt.getTime())
    ? (createdAt.toDateString() === today.toDateString() ? 'today' : 'earlier')
    : r.bucket;
  return {
    id: r.id,
    kind: r.kind,
    cat: r.cat,
    bucket,
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
    routeId: r.route_id ?? undefined,
    title: r.title,
    day: r.day,
    media: r.media as TLMedia[] | undefined,
    timeStart: r.time_mins ?? undefined,
    timeEnd: r.time_end_mins ?? undefined,
    synth: r.is_synth ?? false,
    custom: r.is_custom ?? false,
    checked: r.checked ?? false,
    kind: r.item_kind === 'transport' || r.item_kind === 'stay' || r.item_kind === 'custom' ? r.item_kind : 'activity',
    location: r.location && typeof r.location === 'object' ? r.location : undefined,
    transport: r.transport && typeof r.transport === 'object' ? r.transport : undefined,
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
    caption: r.caption ?? undefined,
    createdAt: r.created_at ?? undefined,
    userId: r.user_id ?? undefined,
  };
}
