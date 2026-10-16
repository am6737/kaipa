import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { removeMedia, uploadMedia } from '../lib/storage';
import { useMe } from './useMe';
import type { RouteComment, RouteCommentMedia, RouteCommentReportReason, RouteCommentSort } from '../data/routeComments';

type Row = { id: string; route_id: string; user_id: string; parent_id: string | null; reply_to_user_id: string | null; author_name: string; body: string; media: unknown; status: RouteComment['status']; like_count: number; reply_count: number; created_at: string; route_comment_likes?: { user_id: string }[] };
type ProfileRow = { id: string; display_name?: string | null; nick?: string | null; avatar_url?: string | null };
const commentSelect = 'id,route_id,user_id,parent_id,reply_to_user_id,author_name,body,media,status,like_count,reply_count,created_at,route_comment_likes(user_id)';
const profileSelect = 'id,display_name,nick,avatar_url';
const ANONYMOUS_AUTHOR = '匿名用户';
// Observations written before the author-name fix persisted a hard-coded '我'/'Me'.
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
function mapRow(row: Row, profiles: Map<string, ProfileRow>): RouteComment {
  const profile = profiles.get(row.user_id);
  const replyToProfile = row.reply_to_user_id ? profiles.get(row.reply_to_user_id) : undefined;
  return {
    id: row.id, routeId: row.route_id, parentId: row.parent_id, userId: row.user_id,
    author: resolveAuthorName(profile, row.author_name), authorAvatarUrl: profile?.avatar_url || null,
    replyTo: row.reply_to_user_id ? { userId: row.reply_to_user_id, name: resolveAuthorName(replyToProfile, null) } : null,
    body: row.body, media: Array.isArray(row.media) ? row.media as RouteCommentMedia[] : [],
    status: row.status, likeCount: row.like_count, liked: Boolean(row.route_comment_likes?.length), replyCount: row.reply_count,
    createdAt: row.created_at, replies: [],
  };
}
async function mapRows(rows: Row[]) {
  const profiles = await fetchProfilesByIds(rows.flatMap((row) => [row.user_id, row.reply_to_user_id]));
  return rows.map((row) => mapRow(row, profiles));
}
async function fetchComment(id: string) {
  const { data, error } = await supabase.from('route_comments').select(commentSelect).eq('id', id).single();
  if (error) throw error;
  return (await mapRows([data as Row]))[0];
}

// Mutations from any screen are pushed to every mounted list of the same route,
// so the preview panel and the full comment page stay in step.
type CommentEvent = { type: 'upsert'; comment: RouteComment; created?: boolean } | { type: 'remove'; comment: RouteComment };
type Listener = (event: CommentEvent) => void;
const subscribers = new Map<string, Set<Listener>>();
function broadcast(routeId: string, event: CommentEvent) {
  for (const listener of subscribers.get(routeId) ?? []) listener(event);
}

type State = { comments: RouteComment[]; total: number };
function applyEvent(state: State, event: CommentEvent, limit: number | null): State {
  const { comment } = event;
  if (comment.parentId) {
    const parent = state.comments.find((item) => item.id === comment.parentId);
    if (!parent) return state;
    const exists = parent.replies.some((item) => item.id === comment.id);
    if (event.type === 'upsert') {
      if (!exists && !event.created) return state;
      const replies = exists ? parent.replies.map((item) => item.id === comment.id ? comment : item) : [...parent.replies, comment];
      const next = { ...parent, replies, replyCount: parent.replyCount + (exists ? 0 : 1) };
      return { comments: state.comments.map((item) => item.id === parent.id ? next : item), total: state.total + (exists ? 0 : 1) };
    }
    if (!exists) return state;
    const replies = parent.replies.filter((item) => item.id !== comment.id);
    const next = { ...parent, replies, replyCount: Math.max(0, parent.replyCount - 1) };
    // The server drops a deleted placeholder together with its last reply.
    const comments = next.status === 'deleted' && !replies.length
      ? state.comments.filter((item) => item.id !== parent.id)
      : state.comments.map((item) => item.id === parent.id ? next : item);
    return { comments, total: Math.max(0, state.total - 1) };
  }
  const previous = state.comments.find((item) => item.id === comment.id);
  if (event.type === 'remove') {
    if (!previous) return state;
    return { comments: state.comments.filter((item) => item.id !== comment.id), total: Math.max(0, state.total - (previous.status === 'visible' ? 1 : 0)) };
  }
  if (previous) {
    const next = { ...comment, replies: previous.replies };
    const lostVisibility = previous.status === 'visible' && comment.status !== 'visible';
    return { comments: state.comments.map((item) => item.id === comment.id ? next : item), total: Math.max(0, state.total - (lostVisibility ? 1 : 0)) };
  }
  if (!event.created) return state;
  const comments = [comment, ...state.comments];
  return { comments: limit ? comments.slice(0, limit) : comments, total: state.total + 1 };
}

/**
 * Top-level comments of a route with their replies. `preview` loads only the
 * first page of visible comments, without replies, for the route card.
 */
export function useRouteComments(routeId: string, { sort = 'hot', pageSize = 20, preview = false }: { sort?: RouteCommentSort; pageSize?: number; preview?: boolean } = {}) {
  const [state, setState] = useState<State>({ comments: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const currentUserId = useMe();
  const requestVersion = useRef(0);
  const loaded = useRef(0);

  const fetchPage = useCallback(async (offset: number) => {
    let query = supabase.from('route_comments').select(commentSelect).eq('route_id', routeId).is('parent_id', null);
    if (preview) query = query.eq('status', 'visible');
    query = sort === 'hot'
      ? query.order('like_count', { ascending: false }).order('reply_count', { ascending: false }).order('created_at', { ascending: false })
      : query.order('created_at', { ascending: false });
    const result = await query.range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const rows = result.data as Row[];
    let replyRows: Row[] = [];
    if (!preview && rows.length) {
      const replies = await supabase.from('route_comments').select(commentSelect).in('parent_id', rows.map((row) => row.id)).eq('status', 'visible').order('created_at', { ascending: true }).limit(1000);
      if (replies.error) throw replies.error;
      replyRows = replies.data as Row[];
    }
    const mapped = await mapRows([...rows, ...replyRows]);
    const roots = mapped.slice(0, rows.length);
    const replies = mapped.slice(rows.length);
    return { comments: roots.map((root) => ({ ...root, replies: replies.filter((reply) => reply.parentId === root.id) })), more: rows.length === pageSize };
  }, [routeId, sort, pageSize, preview]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const [page, count] = await Promise.all([
        fetchPage(0),
        supabase.from('route_comments').select('id', { count: 'exact', head: true }).eq('route_id', routeId).eq('status', 'visible'),
      ]);
      if (version !== requestVersion.current) return;
      if (count.error) throw count.error;
      loaded.current = page.comments.length;
      setState({ comments: page.comments, total: count.count ?? page.comments.length });
      setHasMore(page.more);
      setError(null);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [fetchPage, routeId]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(loaded.current);
      if (version !== requestVersion.current) return;
      loaded.current += page.comments.length;
      setState((old) => {
        const known = new Set(old.comments.map((item) => item.id));
        return { ...old, comments: [...old.comments, ...page.comments.filter((item) => !known.has(item.id))] };
      });
      setHasMore(page.more);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loading, loadingMore]);

  useEffect(() => {
    setState({ comments: [], total: 0 });
    const listeners = subscribers.get(routeId) ?? new Set();
    subscribers.set(routeId, listeners);
    const listener: Listener = (event) => {
      if (preview && event.comment.parentId) {
        // The card shows reply counts only.
        const delta = event.type === 'remove' ? -1 : event.created ? 1 : 0;
        if (delta) setState((old) => ({ comments: old.comments.map((item) => item.id === event.comment.parentId ? { ...item, replyCount: Math.max(0, item.replyCount + delta) } : item), total: Math.max(0, old.total + delta) }));
        return;
      }
      setState((old) => {
        const next = applyEvent(old, event, preview ? pageSize : null);
        return preview ? { ...next, comments: next.comments.filter((item) => item.status === 'visible') } : next;
      });
    };
    listeners.add(listener);
    void refresh();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        ++requestVersion.current;
        setTimeout(() => { if (listeners.has(listener)) void refresh(); }, 0);
      }
    });
    return () => { ++requestVersion.current; authListener.subscription.unsubscribe(); listeners.delete(listener); if (!listeners.size) subscribers.delete(routeId); };
  }, [routeId, refresh, preview, pageSize]);

  return { comments: state.comments, total: state.total, loading, loadingMore, hasMore, error, refresh, loadMore, currentUserId };
}

export async function submitRouteComment(args: { routeId: string; body: string; media?: RouteCommentMedia[]; parentId?: string | null; replyToUserId?: string | null }) {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) throw new Error('请先登录后再评论');
  const authorProfile = (await fetchProfilesByIds([user.id])).get(user.id);
  const media = args.parentId ? [] : args.media ?? [];
  const uploaded: RouteCommentMedia[] = [];
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
    const results = new Array<RouteCommentMedia>(media.length);
    let next = 0;
    const worker = async () => {
      while (next < media.length) {
        const index = next++;
        const item = media[index];
        results[index] = { ...item, uri: await upload(item.uri), thumbnail: item.thumbnail ? await upload(item.thumbnail) : undefined, pairedVideoUri: item.pairedVideoUri ? await upload(item.pairedVideoUri) : undefined };
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, media.length) }, worker));
    uploaded.push(...results);
  } catch (error) {
    await removeMedia(newUris).catch(() => {});
    throw error;
  }
  const { data, error } = await supabase.from('route_comments').insert({
    route_id: args.routeId, user_id: user.id, parent_id: args.parentId ?? null, reply_to_user_id: args.replyToUserId ?? null,
    author_name: resolveAuthorName(authorProfile, null), body: args.body.trim(), media: uploaded,
  }).select(commentSelect).single();
  if (error) {
    await removeMedia(newUris).catch(() => {});
    throw error;
  }
  const comment = (await mapRows([data as Row]))[0];
  broadcast(args.routeId, { type: 'upsert', comment, created: true });
  return comment;
}

export async function toggleRouteCommentLike(comment: RouteComment) {
  const { error } = await supabase.rpc('toggle_route_comment_like', { p_id: comment.id });
  if (error) throw error;
  const updated = { ...(await fetchComment(comment.id)), replies: comment.replies };
  broadcast(comment.routeId, { type: 'upsert', comment: updated });
  return updated;
}

export async function deleteRouteComment(comment: RouteComment) {
  const { data, error } = await supabase.rpc('delete_route_comment', { p_id: comment.id });
  if (error) throw error;
  // Best effort: signed URLs from the private bucket are not removable here
  // and simply stay for the storage sweep.
  const mediaUris = [...new Set(comment.media.flatMap((item) => [item.uri, item.thumbnail, item.pairedVideoUri]).filter((uri): uri is string => Boolean(uri)))];
  if (mediaUris.length) await removeMedia(mediaUris).catch(() => {});
  if (data === 'tombstoned') broadcast(comment.routeId, { type: 'upsert', comment: { ...comment, status: 'deleted', body: '', media: [] } });
  else broadcast(comment.routeId, { type: 'remove', comment });
}

export async function reportRouteComment(comment: RouteComment, reason: RouteCommentReportReason) {
  const { error } = await supabase.rpc('report_route_comment', { p_id: comment.id, p_reason: reason });
  if (error) throw error;
}
