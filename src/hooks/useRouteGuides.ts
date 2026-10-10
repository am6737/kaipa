import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RouteCommunityGuide, RouteGuidePlan, GuideText } from '../data/routeGuides';

type Row = { id: string; title: string; intro: string | null; reflection: string | null; plan: RouteGuidePlan; author_id: string; submitted_at: string; updated_at: string; helpful_count: number; profile?: { display_name?: string | null; nick?: string | null; avatar_url?: string | null } | null };
export type MyRouteGuideStatus = { id: string; status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null; updatedAt: string; title: string; intro: string; reflection: string; plan: RouteGuidePlan | null };
const text = (value: string): GuideText => ({ zh: value, en: value });
const mapRow = (row: Row): RouteCommunityGuide => ({
  id: row.id, title: text(row.title), description: text(row.intro || ''), author: text(row.profile?.display_name || row.profile?.nick || 'Kaipa 用户'), authorAvatarUrl: row.profile?.avatar_url || null,
  season: 'autumn', travelDate: row.submitted_at.slice(0, 10), publishedDate: row.submitted_at.slice(0, 10), updatedDate: row.updated_at.slice(0, 10),
  helpful: row.helpful_count || 0, plan: row.plan, review: text(row.reflection || row.intro || ''),
});

export function useRouteGuides(routeId: string) {
  const [guides, setGuides] = useState<RouteCommunityGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('route_guides').select('id,title,intro,reflection,plan,author_id,submitted_at,updated_at,helpful_count').eq('route_id', routeId).eq('status', 'approved').order('updated_at', { ascending: false });
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
  return { guides, loading, refresh };
}

export async function submitRouteGuide(input: { routeId: string; authorId: string; title: string; intro: string; reflection: string; plan: RouteGuidePlan }) {
  const { error } = await supabase.from('route_guides').insert({ route_id: input.routeId, author_id: input.authorId, title: input.title.trim(), intro: input.intro.trim(), reflection: input.reflection.trim(), plan: input.plan, status: 'pending' });
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
