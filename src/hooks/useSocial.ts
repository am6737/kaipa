// useSocial.ts — 主页与关注体系的数据。
//
// 别人的内容只能经由 profile_* RPC 读到，可见范围、拉黑和轨迹起终点裁剪都在
// 服务端判断（见 docs/me-social-profile.md）。自己的主页缓存在本地，离线也能打开。
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOfflineState } from '../lib/offlineCache';

export type Visibility = 'private' | 'followers' | 'public';
export type FollowState = 'none' | 'pending' | 'accepted';

export type ProfileRelation = {
  self: boolean;
  following: FollowState;
  followedBy: boolean;
  /** 对方向我发了还没处理的关注请求。 */
  requestedMe: boolean;
  blocked: boolean;
};

export type ProfileSummary = {
  id: string;
  nick: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarIni: string | null;
  avatarColor: string | null;
  isPrivate: boolean;
  followers: number;
  following: number;
  pendingRequests: number | null;
  relation: ProfileRelation;
  canView: boolean;
  outings: number | null;
  /** 只给粉丝看、我还看不到的出行数。 */
  hiddenOutings: number | null;
  /** 我能看到的装备清单数。 */
  gearSets: number | null;
};

/** 别人主页上的一份装备清单。重量是千克，不含备选（optional）。 */
export type GearSetCard = {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  itemCount: number;
  weightKg: number;
};

export type GearSetPreviewItem = {
  name: string;
  category: string | null;
  categoryColor: string | null;
  weightKg: number;
  qty: number;
  status: 'packed' | 'worn' | 'consumable' | 'optional';
  owned: boolean;
};

export type GearSetPreview = GearSetCard & { ownerId: string; items: GearSetPreviewItem[] };

/** 列表里的一个人：粉丝、关注、搜索结果、可能认识的人、关注请求。 */
export type ProfileCard = {
  id: string;
  nick: string;
  username: string | null;
  avatarUrl: string | null;
  avatarIni: string | null;
  avatarColor: string | null;
  isPrivate: boolean;
  relation: ProfileRelation;
};

export type OutingPhoto = { id: string; uri: string; thumbnail: string | null; kind: string };

export type Outing = {
  id: string;
  kind: 'both' | 'journey' | 'track';
  journeyId: string | null;
  trackId: string | null;
  visibility: Visibility;
  title: string;
  routeId: string | null;
  routeName: string | null;
  region: string | null;
  dateLabel: string | null;
  occurredAt: string;
  totalDays: number | null;
  distM: number | null;
  ascM: number | null;
  durationMs: number | null;
  /** [lng, lat]，别人看时已裁掉起终点各 200 m。 */
  coords: [number, number][] | null;
  endsHidden: boolean;
  /** 来自轨迹文件，不是在 App 里录的。 */
  imported?: boolean;
  companions: number;
  photoCount: number;
  photos: OutingPhoto[];
};

const PAGE_SIZE = 20;

export function useProfileSummary(viewerId: string | undefined, userId: string | undefined) {
  const self = Boolean(userId && userId === viewerId);
  const [summary, setSummary] = useOfflineState<ProfileSummary | null>(self ? viewerId : undefined, 'profile-summary', null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!viewerId || !userId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('profile_summary', { p_user: userId });
    setLoading(false);
    if (error) {
      console.warn('[useProfileSummary] fetch error:', error.message);
      return;
    }
    setSummary((data as ProfileSummary | null) ?? null);
  }, [viewerId, userId, setSummary]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { summary, loading, refresh };
}

export function useProfileOutings(viewerId: string | undefined, userId: string | undefined) {
  const self = Boolean(userId && userId === viewerId);
  // 只缓存第一页；翻出来的更早内容联网时再取。
  const [firstPage, setFirstPage] = useOfflineState<Outing[]>(self ? viewerId : undefined, 'profile-outings', []);
  const [older, setOlder] = useState<Outing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const loadingMore = useRef(false);

  const refresh = useCallback(async () => {
    if (!viewerId || !userId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('profile_outings', { p_user: userId, p_limit: PAGE_SIZE });
    setLoading(false);
    if (error) {
      console.warn('[useProfileOutings] fetch error:', error.message);
      return;
    }
    const rows = (data as Outing[] | null) ?? [];
    setFirstPage(rows);
    setOlder([]);
    setHasMore(rows.length === PAGE_SIZE);
  }, [viewerId, userId, setFirstPage]);

  useEffect(() => { void refresh(); }, [refresh]);

  const outings = older.length ? [...firstPage, ...older] : firstPage;

  const loadMore = useCallback(async () => {
    const last = outings[outings.length - 1];
    if (!userId || !last || !hasMore || loadingMore.current) return;
    loadingMore.current = true;
    const { data, error } = await supabase.rpc('profile_outings', {
      p_user: userId,
      p_before: last.occurredAt,
      p_limit: PAGE_SIZE,
    });
    loadingMore.current = false;
    if (error) {
      console.warn('[useProfileOutings] load more error:', error.message);
      return;
    }
    const rows = (data as Outing[] | null) ?? [];
    setOlder((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
  }, [outings, userId, hasMore]);

  return { outings, loading, hasMore, loadMore, refresh };
}

export function useFollowList(userId: string | undefined, kind: 'followers' | 'following') {
  const [people, setPeople] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const busy = useRef(false);

  const fetchPage = useCallback(async (offset: number) => {
    const { data, error } = await supabase.rpc('profile_follow_list', {
      p_user: userId, p_kind: kind, p_offset: offset, p_limit: PAGE_SIZE * 2,
    });
    if (error) {
      console.warn('[useFollowList] fetch error:', error.message);
      return null;
    }
    return (data as ProfileCard[] | null) ?? [];
  }, [userId, kind]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const rows = await fetchPage(0);
    setLoading(false);
    if (!rows) return;
    setPeople(rows);
    setHasMore(rows.length === PAGE_SIZE * 2);
  }, [userId, fetchPage]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!hasMore || busy.current) return;
    busy.current = true;
    const rows = await fetchPage(people.length);
    busy.current = false;
    if (!rows) return;
    setPeople((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE * 2);
  }, [hasMore, fetchPage, people.length]);

  return { people, setPeople, loading, hasMore, loadMore, refresh };
}

export async function fetchFollowRequests() {
  return (await call<ProfileCard[] | null>('follow_requests', {})) ?? [];
}

export async function searchProfiles(query: string) {
  return (await call<ProfileCard[] | null>('search_profiles', { p_query: query, p_limit: 30 })) ?? [];
}

export async function fetchSuggestedProfiles() {
  return (await call<ProfileCard[] | null>('suggested_profiles', { p_limit: 20 })) ?? [];
}

/** 关注动作之后，本地把关系改成服务端会给出的样子，不必整页重取。 */
export function withFollowState<T extends { relation: ProfileRelation }>(item: T, following: FollowState): T {
  return { ...item, relation: { ...item.relation, following } };
}

async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const followUser = (target: string) => call<FollowState>('follow_user', { p_target: target });
export const unfollowUser = (target: string) => call('unfollow_user', { p_target: target });
export const respondFollowRequest = (follower: string, accept: boolean) =>
  call('respond_follow_request', { p_follower: follower, p_accept: accept });
export const removeFollower = (follower: string) => call('remove_follower', { p_follower: follower });
export const blockUser = (target: string) => call('block_user', { p_target: target });
export const unblockUser = (target: string) => call('unblock_user', { p_target: target });
export const setAccountPrivate = (value: boolean) => call('set_account_private', { p_private: value });

export const setOutingVisibility = (outing: { journeyId: string | null; trackId: string | null }, visibility: Visibility) =>
  call('set_outing_visibility', { p_journey_id: outing.journeyId, p_track_id: outing.journeyId ? null : outing.trackId, p_visibility: visibility });
export const fetchProfileGearSets = async (userId: string) =>
  (await call<GearSetCard[] | null>('profile_gear_sets', { p_user: userId })) ?? [];
/** 看不到（私密、被拉黑、已删除）时返回 null。 */
export const fetchGearSetPreview = (setId: string) => call<GearSetPreview | null>('profile_gear_set', { p_set: setId });
/** 存为我的清单，返回新清单 id。之后要 refetchGear 才能在装备页看到。 */
export const copyGearSet = (setId: string) => call<string>('copy_gear_set', { p_set: setId });

/** 发布轨迹的上传人，只带昵称和头像。 */
export type PublishedTrackOwner = {
  id: string;
  nick: string;
  avatarUrl: string | null;
  avatarIni: string | null;
  avatarColor: string | null;
};

/** 搜索结果里的一条已发布轨迹；坐标已抽稀，只够画缩略图。 */
export type PublishedTrackCard = {
  id: string;
  name: string;
  distM: number | null;
  ascM: number | null;
  durationMs: number | null;
  publishedAt: string;
  coords: [number, number][];
  owner: PublishedTrackOwner;
};

/** 按轨迹名或上传人昵称搜索已发布的轨迹。 */
export const searchPublishedTracks = async (query: string, limit = 20) =>
  (await call<PublishedTrackCard[] | null>('search_published_tracks', { p_query: query, p_limit: limit })) ?? [];
/** 完整的已发布轨迹（未发布、被拉黑时为 null），owner 之外的字段和 tracks 行同名，交给 toTrack。 */
export const fetchPublishedTrack = (trackId: string) =>
  call<(Record<string, unknown> & { owner: PublishedTrackOwner }) | null>('published_track', { p_track: trackId });
