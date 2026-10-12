import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RouteCommunityGuide, RouteGuidePlan, GuideText } from '../data/routeGuides';

type Row = { id: string; title: string; intro: string | null; reflection: string | null; plan: RouteGuidePlan; author_id: string; submitted_at: string; updated_at: string; helpful_count: number; route_guide_helpful_votes?: { user_id: string }[]; profile?: { display_name?: string | null; nick?: string | null; avatar_url?: string | null } | null };
const guideSelect = 'id,title,intro,reflection,plan,author_id,submitted_at,updated_at,helpful_count,route_guide_helpful_votes(user_id)';
export type MyRouteGuideStatus = { id: string; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; updatedAt: string; title: string; intro: string; reflection: string; plan: RouteGuidePlan | null };
export type MyRouteGuide = MyRouteGuideStatus & { routeId: string; submittedAt: string; helpfulCount: number };
const text = (value: string): GuideText => ({ zh: value, en: value });
const mapRow = (row: Row): RouteCommunityGuide => ({
  id: row.id, title: text(row.title), description: text(row.intro || ''), author: text(row.profile?.display_name || row.profile?.nick || 'Kaipa 用户'), authorAvatarUrl: row.profile?.avatar_url || null,
  season: 'autumn', travelDate: row.submitted_at.slice(0, 10), publishedDate: row.submitted_at.slice(0, 10), updatedDate: row.updated_at.slice(0, 10),
  helpful: row.helpful_count || 0, helpfulMarked: Boolean(row.route_guide_helpful_votes?.length), plan: row.plan, review: text(row.reflection || row.intro || ''),
});

export function useRouteGuides(routeId: string) {
  const [guides, setGuides] = useState<RouteCommunityGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('route_guides').select(guideSelect).eq('route_id', routeId).eq('status', 'approved').order('updated_at', { ascending: false });
    if (!error) {
      const rows = data || [];
      const authorIds = [...new Set(rows.map((row) => row.author_id).filter(Boolean))];
      const profiles = authorIds.length ? await supabase.from('profiles').select('id,display_name,nick,avatar_url').in('id', authorIds) : { data: [], error: null };
      const profileById = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
      setGuides(rows.map((row) => mapRow({ ...row, profile: profileById.get(row.author_id) || null } as unknown as Row)));
    }
    setLoading(false);
  }, [routeId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void refresh();
    });
    return () => authListener.subscription.unsubscribe();
  }, [refresh]);
  const toggleHelpful = useCallback(async (guideId: string) => {
    const flip = () => setGuides((old) => old.map((item) => item.id === guideId ? { ...item, helpfulMarked: !item.helpfulMarked, helpful: item.helpful + (item.helpfulMarked ? -1 : 1) } : item));
    flip();
    try {
      const { error } = await supabase.rpc('route_guide_helpful', { p_id: guideId });
      if (error) throw error;
      const { data, error: readError } = await supabase.from('route_guides').select('helpful_count,route_guide_helpful_votes(user_id)').eq('id', guideId).single();
      if (readError) throw readError;
      setGuides((old) => old.map((item) => item.id === guideId ? { ...item, helpful: data.helpful_count || 0, helpfulMarked: Boolean((data as { route_guide_helpful_votes?: unknown[] }).route_guide_helpful_votes?.length) } : item));
    } catch (error) {
      flip();
      throw error;
    }
  }, []);
  return { guides, loading, refresh, toggleHelpful };
}

export async function submitRouteGuide(input: { routeId: string; authorId: string; title: string; intro: string; reflection: string; plan: RouteGuidePlan }) {
  const { error } = await supabase.from('route_guides').insert({ route_id: input.routeId, author_id: input.authorId, title: input.title.trim(), intro: input.intro.trim(), reflection: input.reflection.trim(), plan: input.plan, status: 'pending' });
  if (error) throw error;
}

export async function updateRouteGuide(input: { id: string; title: string; intro: string; reflection: string; plan?: RouteGuidePlan | null }) {
  const payload: Record<string, unknown> = { title: input.title.trim(), intro: input.intro.trim(), reflection: input.reflection.trim(), status: 'pending', rejection_reason: null, updated_at: new Date().toISOString() };
  if (input.plan) payload.plan = input.plan;
  const { error } = await supabase.from('route_guides').update(payload).eq('id', input.id);
  if (error) throw error;
}

export async function deleteRouteGuide(id: string) {
  const { error } = await supabase.from('route_guides').delete().eq('id', id);
  if (error) throw error;
}

export function useMyRouteGuideStatus(routeId: string | undefined, authorId: string | undefined) {
  const [status, setStatus] = useState<MyRouteGuideStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(routeId && authorId));
  const refresh = useCallback(async () => {
    if (!routeId || !authorId) { setStatus(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('route_guides').select('id,status,rejection_reason,updated_at,title,intro,reflection,plan').eq('route_id', routeId).eq('author_id', authorId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!error) setStatus(data ? { id: data.id, status: data.status, rejectionReason: data.rejection_reason, updatedAt: data.updated_at, title: data.title, intro: data.intro || '', reflection: data.reflection || '', plan: data.plan as RouteGuidePlan } : null);
    setLoading(false);
  }, [authorId, routeId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { status, loading, refresh };
}

/** All submissions owned by the signed-in user, for the personal guide library. */
export function useMyRouteGuides(authorId: string | undefined) {
  const [guides, setGuides] = useState<MyRouteGuide[]>([]);
  const [loading, setLoading] = useState(Boolean(authorId));
  const refresh = useCallback(async () => {
    if (!authorId) { setGuides([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('route_guides')
      .select('id,route_id,status,rejection_reason,updated_at,submitted_at,title,intro,reflection,plan,helpful_count')
      .eq('author_id', authorId).order('updated_at', { ascending: false });
    if (!error) setGuides((data || []).map((row) => ({
      id: row.id, routeId: row.route_id, status: row.status, rejectionReason: row.rejection_reason,
      updatedAt: row.updated_at, submittedAt: row.submitted_at, title: row.title, intro: row.intro || '',
      reflection: row.reflection || '', plan: row.plan as RouteGuidePlan, helpfulCount: row.helpful_count || 0,
    })));
    setLoading(false);
  }, [authorId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { guides, loading, refresh };
}
