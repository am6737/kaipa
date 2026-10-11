import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Track } from "../data/tracks";
export type RouteRequest = {
  id: string;
  name: string;
  region: string;
  note: string;
  lng: number;
  lat: number;
  address?: string | null;
  trackId?: string | null;
  trackSnapshot?: unknown;
  status: "pending" | "accepted" | "rejected" | "duplicate";
  reviewNote?: string | null;
  routeId?: string | null;
  createdAt: string;
  updatedAt: string;
};
const map = (r: any): RouteRequest => ({
  id: r.id,
  name: r.name,
  region: r.region || "",
  note: r.note || "",
  lng: r.lng,
  lat: r.lat,
  address: r.address,
  trackId: r.track_id,
  trackSnapshot: r.track_snapshot,
  status: r.status,
  reviewNote: r.review_note,
  routeId: r.route_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export function useRouteRequests(userId?: string) {
  const [requests, setRequests] = useState<RouteRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const refresh = useCallback(async () => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("route_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setRequests((data || []).map(map));
    setLoading(false);
  }, [userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const createRequest = useCallback(
    async (draft: {
      name: string;
      region?: string;
      note?: string;
      lng: number;
      lat: number;
      address?: string;
      track?: Track | null;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const t = draft.track;
      const { data, error } = await supabase
        .from("route_requests")
        .insert({
          user_id: userId,
          name: draft.name.trim(),
          region: draft.region || "",
          note: draft.note || "",
          lng: draft.lng,
          lat: draft.lat,
          address: draft.address || null,
          track_id: t?.id || null,
          track_snapshot: t
            ? {
                name: t.name,
                coords: t.coords,
                dist_m: t.distM,
                asc_m: t.ascM,
                file_url: t.fileUrl,
              }
            : null,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) throw error;
      const item = map(data);
      setRequests((v) => [item, ...v]);
      return item;
    },
    [userId],
  );
  const deleteRequest = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("route_requests")
      .delete()
      .eq("id", id);
    if (error) throw error;
    setRequests((v) => v.filter((x) => x.id !== id));
  }, []);
  return { requests, loading, refresh, createRequest, deleteRequest };
}
