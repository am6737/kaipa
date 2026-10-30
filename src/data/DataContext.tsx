import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { useRoutes } from '../hooks/useRoutes';
import { useTracks, type TrackDraft } from '../hooks/useTracks';
import { useJourneys } from '../hooks/useJourneys';
import { useGear } from '../hooks/useGear';
import { useNotifications } from '../hooks/useNotifications';
import { useProfile } from '../hooks/useProfile';
import type { UserProfile } from '../hooks/useProfile';
import { usePlanningProfile } from '../hooks/usePlanningProfile';
import type { UserPlanningProfile } from '../hooks/usePlanningProfile';
import { usePresencePublisher } from '../hooks/useCompanionPresence';
import type { Poi } from './pois';
import type { GearCat, GearItem, GearSet, GearSetOverride } from './gear';
import type { Notif } from './notifications';
import type { Track } from './tracks';
import { useJourneyHomeContent, type JourneyHomeContent } from '../hooks/useJourneyHomeContent';
import { useRouteRequests, type RouteRequest } from '../hooks/useRouteRequests';

export interface DataValue {
  userId: string;
  profile: UserProfile;
  profileLoading: boolean;
  /** The last profile read failed (usually offline); `profile` is cached or empty. */
  profileStale: boolean;
  updateProfile: (field: string, value: string) => Promise<void>;
  /** 本地立即生效的偏好写入；离线时排队，联网后自动补发。 */
  updateProfileOffline: (field: string, value: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateAvatar: (localUri: string) => Promise<void>;
  planningProfile: UserPlanningProfile;
  planningProfileLoading: boolean;
  savePlanningProfile: (profile: UserPlanningProfile) => Promise<void>;
  routes: Poi[];
  routesLoading: boolean;
  journeys: Poi[];
  trashedJourneys: Poi[];
  journeysLoading: boolean;
  createJourney: (poi: Partial<Poi>) => Promise<Poi | null>;
  updateJourney: (id: string, patch: Partial<Poi>) => Promise<void>;
  /** Owner only; throws when the server refuses. */
  setJourneyVisibility: (id: string, visibility: NonNullable<Poi['visibility']>) => Promise<void>;
  updateRoute: (id: string, patch: Partial<Poi>) => Promise<void>;
  toggleRouteFavorite: (id: string, current: boolean) => Promise<void>;
  deleteJourney: (id: string) => Promise<void>;
  restoreJourney: (id: string) => Promise<void>;
  permanentlyDeleteJourney: (id: string) => Promise<void>;
  leaveJourney: (id: string) => Promise<void>;
  toggleFav: (id: string, current: boolean) => Promise<void>;
  refetchJourneys: () => Promise<Poi[]>;
  journeyHomeContent: JourneyHomeContent;
  journeyHomeContentLoading: boolean;
  refetchJourneyHomeContent: () => Promise<void>;
  refetchRoutes: () => Promise<void>;
  routeRequests: RouteRequest[];
  routeRequestsLoading: boolean;
  createRouteRequest: ReturnType<typeof useRouteRequests>['createRequest'];
  deleteRouteRequest: (id: string) => Promise<void>;
  refetchRouteRequests: () => Promise<void>;
  /** 「我的轨迹」: the library entries only. */
  tracks: Track[];
  /**
   * Every track row the user owns, including journeys' copies of catalog routes
   * that are not in the library. For looking a track up by id, never for lists.
   */
  allTracks: Track[];
  tracksLoading: boolean;
  createTrack: (draft: TrackDraft) => Promise<Track | null>;
  /** False when the write didn't reach the server (offline, error). */
  updateTrack: (id: string, patch: Partial<TrackDraft>) => Promise<boolean>;
  deleteTrack: (id: string) => Promise<void>;
  /** For tracks not on a journey; throws when the server refuses. */
  setTrackVisibility: (id: string, visibility: NonNullable<Track['visibility']>) => Promise<void>;
  /** Published tracks show up in search for everyone; throws when the server refuses. */
  setTrackPublished: (id: string, published: boolean) => Promise<void>;
  deleteTracks: (ids: string[]) => Promise<void>;
  /** Saves a journey's track into 「我的轨迹」 as its own copy; the saved copy when there already is one. */
  saveTrackToLibrary: (id: string) => Promise<Track | null>;
  refetchTracks: () => Promise<Track[]>;
  cats: GearCat[];
  items: GearItem[];
  sets: GearSet[];
  gearLoading: boolean;
  addCat: (cat: Omit<GearCat, 'id' | 'builtin'>) => Promise<void>;
  updateCat: (id: string, patch: Partial<GearCat>) => Promise<void>;
  deleteCat: (id: string) => Promise<void>;
  addItem: (item: Omit<GearItem, 'id'>) => Promise<GearItem | undefined>;
  updateItem: (id: number, patch: Partial<GearItem>) => Promise<GearItem | undefined>;
  deleteItem: (id: number) => Promise<void>;
  addSet: (name: string, itemIds: number[], overrides?: Record<string, GearSetOverride>, description?: string) => Promise<void>;
  updateSet: (id: string, name: string, itemIds: number[], overrides?: Record<string, GearSetOverride>, description?: string) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  setSetVisibility: (id: string, visibility: NonNullable<GearSet['visibility']>) => Promise<void>;
  refetchGear: () => Promise<void>;
  notifList: Notif[];
  notifUnread: number;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

/**
 * A callback with a fixed identity that always runs the latest `fn`. Several
 * data hooks rebuild their mutators every render; without this the context
 * value would change on every DataProvider render and re-render every
 * `useData()` consumer (all four tab screens included) even when no data moved.
 */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}

export function DataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const {
    profile, loading: profileLoading, stale: profileStale, updateProfile, updateProfileOffline, completeOnboarding, updateAvatar,
  } = useProfile(userId);
  const { routes, loading: routesLoading, updateRoute, toggleFavorite: toggleRouteFavorite, refetch: refetchRoutes } = useRoutes(userId);
  const {
    tracks: allTracks, loading: tracksLoading,
    createTrack, updateTrack, deleteTrack, deleteTracks, saveTrackToLibrary, setTrackVisibility, setTrackPublished,
    refetch: refetchTracks,
  } = useTracks(userId);
  const tracks = useMemo(() => allTracks.filter((track) => track.inLibrary !== false), [allTracks]);
  const {
    journeys, trashedJourneys, loading: journeysLoading,
    createJourney, updateJourney, setJourneyVisibility, deleteJourney, restoreJourney, permanentlyDeleteJourney, leaveJourney, toggleFav,
    refetch: refetchJourneys,
  } = useJourneys(userId, profile);
  const { content: journeyHomeContent, loading: journeyHomeContentLoading, refetch: refetchJourneyHomeContent } = useJourneyHomeContent();
  const { requests: routeRequests, loading: routeRequestsLoading, createRequest: createRouteRequest, deleteRequest: deleteRouteRequest, refresh: refetchRouteRequests } = useRouteRequests(userId);
  const {
    cats, items, sets, loading: gearLoading,
    addCat, updateCat, deleteCat,
    addItem, updateItem, deleteItem,
    addSet, updateSet, deleteSet, setSetVisibility,
    refetch: refetchGear,
  } = useGear(userId);
  const {
    planningProfile, loading: planningProfileLoading, savePlanningProfile,
  } = usePlanningProfile(userId);
  const {
    list: notifList, unread: notifUnread,
    markRead: markNotifRead, markAllRead: markAllNotifsRead,
  } = useNotifications(userId);
  // Live companion sharing rides the toggle in the journey detail, but the
  // publishing itself has to outlive that screen — it lives here.
  usePresencePublisher(userId);

  // Deleting a track makes Postgres null out `journeys.track_id` everywhere it was
  // referenced, so those journeys must be re-read or their pages keep drawing a
  // track that no longer exists. Only pay for it when something was actually linked.
  const removeTracks = useCallback(async (ids: string[]) => {
    await deleteTracks(ids);
    const removing = new Set(ids);
    if (journeys.some((journey) => journey.trackId && removing.has(journey.trackId))) {
      await refetchJourneys();
    }
  }, [deleteTracks, journeys, refetchJourneys]);

  const stable = {
    updateProfile: useStable(updateProfile),
    updateProfileOffline: useStable(updateProfileOffline),
    completeOnboarding: useStable(completeOnboarding),
    updateAvatar: useStable(updateAvatar),
    savePlanningProfile: useStable(savePlanningProfile),
    createRouteRequest: useStable(createRouteRequest),
    deleteRouteRequest: useStable(deleteRouteRequest),
    refetchRouteRequests: useStable(refetchRouteRequests),
    createTrack: useStable(createTrack),
    updateTrack: useStable(updateTrack),
    deleteTrack: useStable(deleteTrack),
    setTrackVisibility: useStable(setTrackVisibility),
    setTrackPublished: useStable(setTrackPublished),
    deleteTracks: useStable(removeTracks),
    saveTrackToLibrary: useStable(saveTrackToLibrary),
    refetchTracks: useStable(refetchTracks),
    createJourney: useStable(createJourney),
    updateJourney: useStable(updateJourney),
    setJourneyVisibility: useStable(setJourneyVisibility),
    updateRoute: useStable(updateRoute),
    toggleRouteFavorite: useStable(toggleRouteFavorite),
    deleteJourney: useStable(deleteJourney),
    restoreJourney: useStable(restoreJourney),
    permanentlyDeleteJourney: useStable(permanentlyDeleteJourney),
    leaveJourney: useStable(leaveJourney),
    toggleFav: useStable(toggleFav),
    refetchJourneys: useStable(refetchJourneys),
    refetchRoutes: useStable(refetchRoutes),
    refetchJourneyHomeContent: useStable(refetchJourneyHomeContent),
    addCat: useStable(addCat),
    updateCat: useStable(updateCat),
    deleteCat: useStable(deleteCat),
    addItem: useStable(addItem),
    updateItem: useStable(updateItem),
    deleteItem: useStable(deleteItem),
    addSet: useStable(addSet),
    updateSet: useStable(updateSet),
    deleteSet: useStable(deleteSet),
    setSetVisibility: useStable(setSetVisibility),
    refetchGear: useStable(refetchGear),
    markNotifRead: useStable(markNotifRead),
    markAllNotifsRead: useStable(markAllNotifsRead),
  };
  // Every function in `stable` keeps its identity, so only data changes are deps.
  const stableRef = useRef(stable);

  const value = useMemo<DataValue>(() => ({
    ...stableRef.current,
    userId,
    profile, profileLoading, profileStale,
    planningProfile, planningProfileLoading,
    routes, routesLoading,
    routeRequests, routeRequestsLoading,
    tracks, allTracks, tracksLoading,
    journeys, trashedJourneys, journeysLoading,
    journeyHomeContent, journeyHomeContentLoading,
    cats, items, sets, gearLoading,
    notifList, notifUnread,
  }), [
    userId,
    profile, profileLoading, profileStale,
    planningProfile, planningProfileLoading,
    routes, routesLoading,
    routeRequests, routeRequestsLoading,
    tracks, allTracks, tracksLoading,
    journeys, trashedJourneys, journeysLoading,
    journeyHomeContent, journeyHomeContentLoading,
    cats, items, sets, gearLoading,
    notifList, notifUnread,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used within DataProvider');
  return v;
}
