import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { removeMedia, uploadMedia } from '../lib/storage';
import { useMe } from './useMe';
import type { RouteCondition } from '../data/routeConditions';

type Row = { id: string; route_id: string; user_id: string; author_name: string; visited_at: string; section: string; body: string; media: unknown; helpful_count: number; created_at: string; route_observation_helpful_votes?: { user_id: string }[] };
type RemoveListener = (id: string) => void;
type ProfileRow = { id: string; display_name?: string | null; nick?: string | null; avatar_url?: string | null };
const observationSelect = '*,route_observation_helpful_votes(user_id)';
const profileSelect = 'id,display_name,nick,avatar_url';
const text = (value: string) => ({ zh: value, en: value });
const ANONYMOUS_AUTHOR = '匿名用户';
// Rows written before the fix persisted a hard-coded '我'/'Me' as author_name.
const LEGACY_AUTHOR_NAMES = new Set(['我', 'Me', 'me']);
function resolveAuthorName(profile: ProfileRow | undefined, storedName: string | null | undefined): string {
  const fromProfile = profile?.display_name?.trim() || profile?.nick?.trim();
  if (fromProfile) return fromProfile;
  if (storedName && !LEGACY_AUTHOR_NAMES.has(storedName)) return storedName;
  return ANONYMOUS_AUTHOR;
}
async function fetchProfilesByIds(userIds: (string | null | undefined)[]): Promise<Map<string, ProfileRow>> {
  const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
  if (!ids.length) return new Map();
  const { data } = await supabase.from('profiles').select(profileSelect).in('id', ids);
  return new Map((data as ProfileRow[] | null)?.map((profile) => [profile.id, profile]) ?? []);
}
const subscribers = new Map<string, Set<ConditionListener>>();
type ConditionListener = { receive: (report: RouteCondition) => void; remove: RemoveListener };
function broadcastReceive(routeId: string, report: RouteCondition) {
  for (const listener of subscribers.get(routeId) ?? []) listener.receive(report);
}
function mapRow(row: Row, profile?: ProfileRow): RouteCondition {
  const media = Array.isArray(row.media) ? row.media as RouteCondition['media'] : [];
  return { id: row.id, routeId: row.route_id, userId: row.user_id, author: text(resolveAuthorName(profile, row.author_name)), authorAvatarUrl: profile?.avatar_url || null, source: 'user', visitedAt: row.visited_at, publishedAt: row.created_at, section: text(row.section), body: text(row.body), photos: media?.map((item) => item.thumbnail || item.uri) ?? [], media, helpful: row.helpful_count, helpfulMarked: Boolean(row.route_observation_helpful_votes?.length) };
}

export function useRouteConditions(routeId: string) {
  const [reports, setReports] = useState<RouteCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const currentUserId = useMe();
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    const result = await supabase.from('route_observations').select(observationSelect).eq('route_id', routeId).order('created_at', { ascending: false });
    if (version !== requestVersion.current) return;
    if (result.error) { setError(result.error); setLoading(false); return; }
    const rows = result.data as Row[];
    const profileById = await fetchProfilesByIds(rows.map((row) => row.user_id));
    if (version !== requestVersion.current) return;
    setError(null);
    setReports(rows.map((row) => mapRow(row, profileById.get(row.user_id))));
    setLoading(false);
  }, [routeId]);
  useEffect(() => {
    setReports([]);
    const listeners = subscribers.get(routeId) ?? new Set();
    subscribers.set(routeId, listeners);
    const listener: ConditionListener = {
      receive: (report) => setReports((old) => old.some((item) => item.id === report.id)
        ? old.map((item) => item.id === report.id ? report : item)
        : [report, ...old]),
      remove: (id) => setReports((old) => old.filter((item) => item.id !== id)),
    };
    listeners.add(listener);
    void refresh();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        ++requestVersion.current;
        setReports([]);
        setTimeout(() => { if (listeners.has(listener)) void refresh(); }, 0);
      }
    });
    return () => { ++requestVersion.current; authListener.subscription.unsubscribe(); listeners.delete(listener); if (!listeners.size) subscribers.delete(routeId); };
  }, [routeId, refresh]);
  return { reports, loading, error, refresh, currentUserId };
}

export async function submitRouteCondition(args: { routeId: string; body: string; visitedAt: Date; media: { uri: string; kind: 'image' | 'video' | 'livePhoto'; thumbnail?: string; pairedVideoUri?: string }[] }) {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) throw new Error('请先登录后发布实况');
  const authorProfile = (await fetchProfilesByIds([user.id])).get(user.id);
  const authorName = resolveAuthorName(authorProfile, null);
  const uploaded: NonNullable<RouteCondition['media']> = [];
  const cloudUris = new Map<string, string>();
  const cloudPromises = new Map<string, Promise<string>>();
  const newUris: string[] = [];
  const upload = async (uri: string) => {
    if (/^https?:/i.test(uri)) return uri;
    if (cloudUris.has(uri)) return cloudUris.get(uri)!;
    const pending = cloudPromises.get(uri);
    if (pending) return pending;
    const request = uploadMedia(uri, user.id, args.routeId).then((cloud) => {
      cloudUris.set(uri, cloud);
      newUris.push(cloud);
      return cloud;
    });
    cloudPromises.set(uri, request);
    return request;
  };
  try {
    // Match the journey detail uploader: four workers keep the UI fast while
    // each worker holds at most one resource ticket at a time.
    const results = new Array<NonNullable<RouteCondition['media']>[number]>(args.media.length);
    let next = 0;
    const worker = async () => {
      while (next < args.media.length) {
        const index = next++;
        const item = args.media[index];
        results[index] = { ...item, uri: await upload(item.uri), thumbnail: item.thumbnail ? await upload(item.thumbnail) : undefined, pairedVideoUri: item.pairedVideoUri ? await upload(item.pairedVideoUri) : undefined };
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, args.media.length) }, worker));
    uploaded.push(...results);
  } catch (error) {
    await removeMedia(newUris).catch(() => {});
    throw error;
  }
  const { data, error } = await supabase.from('route_observations').insert({ route_id: args.routeId, user_id: user.id, author_name: authorName, visited_at: args.visitedAt.toISOString(), body: args.body.trim(), media: uploaded }).select('*').single();
  if (error) throw error;
  const report = mapRow(data as Row, authorProfile);
  broadcastReceive(args.routeId, report);
  return report;
}

export async function markRouteConditionHelpful(id: string) {
  const { error } = await supabase.rpc('route_observation_helpful', { p_id: id });
  if (error) throw error;
  const result = await supabase.from('route_observations').select(observationSelect).eq('id', id).single();
  if (result.error) throw result.error;
  const row = result.data as Row;
  const profileById = await fetchProfilesByIds([row.user_id]);
  const report = mapRow(row, profileById.get(row.user_id));
  broadcastReceive(report.routeId, report);
  return report;
}

export async function deleteRouteCondition(report: RouteCondition) {
  const { error } = await supabase.from('route_observations').delete().eq('id', report.id);
  if (error) throw error;
  // Best effort: signed URLs from the private bucket are not removable here
  // and simply stay for the storage sweep.
  const mediaUris = [...new Set((report.media ?? []).flatMap((item) => [item.uri, item.thumbnail, item.pairedVideoUri]).filter((uri): uri is string => Boolean(uri)))];
  if (mediaUris.length) await removeMedia(mediaUris).catch(() => {});
  for (const listener of subscribers.get(report.routeId) ?? []) listener.remove(report.id);
}
