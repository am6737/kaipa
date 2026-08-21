import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { toJourneyPoi } from "../lib/mappers";
import { ensureCloudMedia } from "../lib/storage";
import { MAX_JOURNEY_PARTICIPANTS, type Poi } from "../data/pois";

const has = (obj: object, key: keyof Poi) =>
  Object.prototype.hasOwnProperty.call(obj, key);

export function useJourneys(userId: string | undefined) {
  const [journeys, setJourneys] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJourneys = useCallback(async () => {
    if (!userId) return;
    let { data, error } = await supabase
      .from("journeys")
      .select(
        `
        *,
        companions ( id, user_id, ini, name, role, color, tone, avatar_url, trips, is_host, is_self, sort_order )
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Keep journey/map data available while an older database is still waiting
    // for supabase/companion-avatar-url.sql. PostgREST rejects the entire nested
    // query when one selected companion column is missing, which otherwise makes
    // the journey tab look empty (including every map avatar).
    if (
      error &&
      (error.message.includes("avatar_url") ||
        error.message.includes("user_id"))
    ) {
      const fallback = await supabase
        .from("journeys")
        .select(
          `
          *,
          companions ( id, ini, name, role, color, tone, trips, is_host, is_self, sort_order )
        `,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) console.warn("[useJourneys] fetch error:", error.message);
    const ownedRows = (data ?? []).map((journey: any) => ({
      ...journey,
      mine: true,
    }));
    let joinedRows: any[] = [];
    const membershipRes = await supabase
      .from("companions")
      .select("journey_id")
      .eq("user_id", userId);
    if (!membershipRes.error) {
      const ownedIds = new Set(ownedRows.map((journey: any) => journey.id));
      const joinedIds = [
        ...new Set(
          (membershipRes.data ?? []).map((row: any) => row.journey_id),
        ),
      ].filter((journeyId) => !ownedIds.has(journeyId));
      if (joinedIds.length) {
        let joinedRes = await supabase
          .from("journeys")
          .select(
            `
            *,
            companions ( id, user_id, ini, name, role, color, tone, avatar_url, trips, is_host, is_self, sort_order )
          `,
          )
          .in("id", joinedIds)
          .order("created_at", { ascending: false });
        if (
          joinedRes.error &&
          (joinedRes.error.message.includes("avatar_url") ||
            joinedRes.error.message.includes("user_id"))
        ) {
          joinedRes = await supabase
            .from("journeys")
            .select(
              `
              *,
              companions ( id, ini, name, role, color, tone, trips, is_host, is_self, sort_order )
            `,
            )
            .in("id", joinedIds)
            .order("created_at", { ascending: false });
        }
        if (!joinedRes.error)
          joinedRows = (joinedRes.data ?? []).map((journey: any) => ({
            ...journey,
            mine: false,
          }));
      }
    }
    setJourneys(
      [...ownedRows, ...joinedRows].map((j: any) =>
        toJourneyPoi({ ...j, asc: j.asc_ }),
      ),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const createJourney = async (poi: Partial<Poi>) => {
    if (!userId) return null;
    const id = poi.id || "j_" + Math.random().toString(36).slice(2, 10);
    const photoUris = await ensureCloudMedia(poi.photoUris, userId, id);
    const row = {
      id,
      user_id: userId,
      route_id: poi.routeId || null,
      name: poi.name || "",
      region: poi.region || "",
      coord: poi.coord || "",
      lng: poi.lng || 0,
      lat: poi.lat || 0,
      dist: poi.dist || "",
      asc_: poi.asc || "",
      diff: poi.diff || null,
      tone: poi.tone || "forest",
      desc: poi.desc || null,
      date: poi.date || null,
      days: poi.days || null,
      planned_date: poi.plannedDate || null,
      countdown: poi.countdown || null,
      day_index: poi.dayIndex || null,
      total_days: poi.totalDays || null,
      fav: poi.fav || false,
      hero_mode: poi.heroMode ?? null,
      track_public: poi.trackPublic || false,
      route_show_photos: poi.routeShowPhotos ?? true,
      route_show_timeline: poi.routeShowTimeline ?? true,
      photo_uris: photoUris ?? null,
      participant_permissions: poi.participantPermissions ?? null,
      track_coords: poi.trackCoords || null,
      track_elevation: poi.trackElevation || null,
      track_duration_ms: poi.trackDurationMs || null,
      track_waypoints: poi.trackWaypoints || null,
      track_file_url: poi.trackFileUrl || null,
      track_file_name: poi.trackFileName || null,
    };
    let insertResult = await supabase
      .from("journeys")
      .insert(row)
      .select()
      .single();
    if (
      insertResult.error?.code === "23503" &&
      insertResult.error.message.includes("route_id")
    ) {
      row.route_id = null;
      insertResult = await supabase
        .from("journeys")
        .insert(row)
        .select()
        .single();
    }
    const { data, error } = insertResult;
    if (error) {
      console.warn("createJourney error:", error.message);
      return null;
    }

    const limitedCompanions = poi.companionList?.slice(0, MAX_JOURNEY_PARTICIPANTS) || [];
    let savedCompanions: any[] = limitedCompanions;
    if (limitedCompanions.length) {
      const companions = limitedCompanions.map((c, i) => ({
        journey_id: id,
        user_id: c.userId || (c.self ? userId : null),
        ini: c.ini,
        name: c.name,
        role: c.role || null,
        color: c.color,
        tone: c.tone || null,
        avatar_url: c.avatarUrl || null,
        trips: c.trips || null,
        is_host: c.host || false,
        is_self: c.self || false,
        sort_order: i,
      }));
      let companionRes = await supabase
        .from("companions")
        .insert(companions)
        .select("*");
      if (
        companionRes.error &&
        (companionRes.error.message.includes("avatar_url") ||
          companionRes.error.message.includes("user_id"))
      ) {
        companionRes = await supabase
          .from("companions")
          .insert(
            companions.map(
              ({ user_id: _userId, avatar_url: _avatarUrl, ...legacyRow }) =>
                legacyRow,
            ),
          )
          .select("*");
      }
      if (companionRes.data) savedCompanions = companionRes.data;
    }

    const newPoi = toJourneyPoi({ ...data, companions: savedCompanions });
    setJourneys((prev) => [newPoi, ...prev]);
    return newPoi;
  };

  const updateJourney = async (id: string, patch: Partial<Poi>) => {
    if (!userId) return;
    const photoUris = has(patch, "photoUris")
      ? await ensureCloudMedia(patch.photoUris, userId, id)
      : undefined;
    const mediaResolvedPatch = has(patch, "photoUris")
      ? { ...patch, photoUris }
      : patch;
    const resolvedPatch = has(mediaResolvedPatch, "companionList")
      ? {
          ...mediaResolvedPatch,
          companionList: mediaResolvedPatch.companionList?.slice(0, MAX_JOURNEY_PARTICIPANTS),
        }
      : mediaResolvedPatch;
    const row: any = {};
    if (has(resolvedPatch, "name")) row.name = resolvedPatch.name;
    if (has(resolvedPatch, "region")) row.region = resolvedPatch.region;
    if (has(resolvedPatch, "coord")) row.coord = resolvedPatch.coord;
    if (has(resolvedPatch, "lng")) row.lng = resolvedPatch.lng;
    if (has(resolvedPatch, "lat")) row.lat = resolvedPatch.lat;
    if (has(resolvedPatch, "desc")) row.desc = resolvedPatch.desc;
    if (has(resolvedPatch, "date")) row.date = resolvedPatch.date || null;
    if (has(resolvedPatch, "days")) row.days = resolvedPatch.days;
    if (has(resolvedPatch, "plannedDate"))
      row.planned_date = resolvedPatch.plannedDate || null;
    if (has(resolvedPatch, "countdown"))
      row.countdown = resolvedPatch.countdown;
    if (has(resolvedPatch, "dayIndex")) row.day_index = resolvedPatch.dayIndex;
    if (has(resolvedPatch, "totalDays"))
      row.total_days = resolvedPatch.totalDays;
    if (has(resolvedPatch, "fav")) row.fav = resolvedPatch.fav;
    if (has(resolvedPatch, "tone")) row.tone = resolvedPatch.tone;
    if (has(resolvedPatch, "dist")) row.dist = resolvedPatch.dist;
    if (has(resolvedPatch, "asc")) row.asc_ = resolvedPatch.asc;
    if (has(resolvedPatch, "trackCoords"))
      row.track_coords = resolvedPatch.trackCoords ?? null;
    if (has(resolvedPatch, "trackElevation"))
      row.track_elevation = resolvedPatch.trackElevation ?? null;
    if (has(resolvedPatch, "trackDurationMs"))
      row.track_duration_ms = resolvedPatch.trackDurationMs ?? null;
    if (has(resolvedPatch, "trackWaypoints"))
      row.track_waypoints = resolvedPatch.trackWaypoints ?? null;
    if (has(resolvedPatch, "trackFileUrl"))
      row.track_file_url = resolvedPatch.trackFileUrl ?? null;
    if (has(resolvedPatch, "trackFileName"))
      row.track_file_name = resolvedPatch.trackFileName ?? null;
    if (has(resolvedPatch, "photoUris"))
      row.photo_uris = resolvedPatch.photoUris ?? null;
    if (has(resolvedPatch, "heroMode"))
      row.hero_mode = resolvedPatch.heroMode ?? null;
    if (has(resolvedPatch, "trackPublic"))
      row.track_public = resolvedPatch.trackPublic;
    if (has(resolvedPatch, "routeShowPhotos"))
      row.route_show_photos = resolvedPatch.routeShowPhotos;
    if (has(resolvedPatch, "routeShowTimeline"))
      row.route_show_timeline = resolvedPatch.routeShowTimeline;
    if (has(resolvedPatch, "participantPermissions"))
      row.participant_permissions = resolvedPatch.participantPermissions;
    row.updated_at = new Date().toISOString();

    if (Object.keys(row).length > 1) {
      const { error } = await supabase
        .from("journeys")
        .update(row)
        .eq("id", id);
      if (error)
        console.warn(
          "[updateJourney] update error:",
          error.message,
          "row:",
          JSON.stringify(row),
        );
    }

    if (resolvedPatch.companionList) {
      const existingIds = resolvedPatch.companionList
        .map((c) => c.id)
        .filter(
          (companionId): companionId is number =>
            companionId != null && companionId > 0,
        );
      let deleteQuery = supabase
        .from("companions")
        .delete()
        .eq("journey_id", id);
      if (existingIds.length)
        deleteQuery = deleteQuery.not("id", "in", `(${existingIds.join(",")})`);
      await deleteQuery;

      for (let i = 0; i < resolvedPatch.companionList.length; i += 1) {
        const c = resolvedPatch.companionList[i];
        const row = {
          journey_id: id,
          user_id: c.userId || (c.self ? userId : null),
          ini: c.ini,
          name: c.name,
          role: c.role || null,
          color: c.color,
          tone: c.tone || null,
          avatar_url: c.avatarUrl || null,
          trips: c.trips || null,
          is_host: c.host || false,
          is_self: c.self || false,
          sort_order: i,
        };
        let companionRes =
          c.id && c.id > 0
            ? await supabase.from("companions").update(row).eq("id", c.id)
            : await supabase.from("companions").insert(row);
        if (
          companionRes.error &&
          (companionRes.error.message.includes("avatar_url") ||
            companionRes.error.message.includes("user_id"))
        ) {
          const {
            user_id: _userId,
            avatar_url: _avatarUrl,
            ...legacyRow
          } = row;
          companionRes =
            c.id && c.id > 0
              ? await supabase
                  .from("companions")
                  .update(legacyRow)
                  .eq("id", c.id)
              : await supabase.from("companions").insert(legacyRow);
        }
        if (companionRes.error)
          console.warn(
            "[updateJourney] companion sync error:",
            companionRes.error.message,
          );
      }
    }

    setJourneys((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...resolvedPatch } : j)),
    );
  };
  const deleteJourney = async (id: string) => {
    await supabase.from("journeys").delete().eq("id", id);
    setJourneys((prev) => prev.filter((j) => j.id !== id));
  };

  const toggleFav = async (id: string, current: boolean) => {
    await supabase.from("journeys").update({ fav: !current }).eq("id", id);
    setJourneys((prev) =>
      prev.map((j) => (j.id === id ? { ...j, fav: !current } : j)),
    );
  };

  return {
    journeys,
    loading,
    createJourney,
    updateJourney,
    deleteJourney,
    toggleFav,
    refetch: fetchJourneys,
  };
}
