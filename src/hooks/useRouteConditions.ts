import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { removeMedia, uploadMedia } from '../lib/storage';
import type { RouteCondition } from '../data/routeConditions';

type Row = { id: string; route_id: string; user_id: string; author_name: string; visited_at: string; section: string; body: string; media: unknown; helpful_count: number; created_at: string };
const text = (value: string) => ({ zh: value, en: value });
const subscribers = new Map<string, Set<(report: RouteCondition) => void>>();
function mapRow(row: Row): RouteCondition {
  const media = Array.isArray(row.media) ? row.media as RouteCondition['media'] : [];
  return { id: row.id, routeId: row.route_id, author: text(row.author_name), source: 'user', visitedAt: row.visited_at, publishedAt: row.created_at, section: text(row.section), body: text(row.body), photos: media?.map((item) => item.thumbnail || item.uri) ?? [], media, helpful: row.helpful_count };
}

export function useRouteConditions(routeId: string) {
  const [reports, setReports] = useState<RouteCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await supabase.from('route_observations').select('*').eq('route_id', routeId).order('created_at', { ascending: false });
    if (result.error) setError(result.error); else { setError(null); setReports((result.data as Row[]).map(mapRow)); }
    setLoading(false);
  }, [routeId]);
  useEffect(() => {
    setReports([]);
    const listeners = subscribers.get(routeId) ?? new Set();
    subscribers.set(routeId, listeners);
    const receive = (report: RouteCondition) => setReports((old) => [report, ...old.filter((item) => item.id !== report.id)]);
    listeners.add(receive);
    void refresh();
    return () => { listeners.delete(receive); if (!listeners.size) subscribers.delete(routeId); };
  }, [routeId, refresh]);
  return { reports, loading, error, refresh };
}

export async function submitRouteCondition(args: { routeId: string; body: string; visitedAt: Date; media: { uri: string; kind: 'image' | 'video' | 'livePhoto'; thumbnail?: string; pairedVideoUri?: string }[]; authorName: string }) {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) throw new Error('请先登录后发布实况');
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
  const { data, error } = await supabase.from('route_observations').insert({ route_id: args.routeId, user_id: user.id, author_name: args.authorName, visited_at: args.visitedAt.toISOString(), body: args.body.trim(), media: uploaded }).select('*').single();
  if (error) throw error;
  const report = mapRow(data as Row);
  for (const receive of subscribers.get(args.routeId) ?? []) receive(report);
  return report;
}

export async function markRouteConditionHelpful(id: string) {
  const { error } = await supabase.rpc('route_observation_helpful', { p_id: id });
  if (error) throw error;
}
