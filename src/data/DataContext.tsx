import React, { createContext, useCallback, useContext } from 'react';
import { useRoutes } from '../hooks/useRoutes';
import { useTracks, type TrackDraft } from '../hooks/useTracks';
import { useJourneys } from '../hooks/useJourneys';
import { useGear } from '../hooks/useGear';
import { useNotifications } from '../hooks/useNotifications';
import { useProfile } from '../hooks/useProfile';
import type { UserProfile } from '../hooks/useProfile';
import { usePlanningProfile } from '../hooks/usePlanningProfile';
import type { UserPlanningProfile } from '../hooks/usePlanningProfile';
import type { Poi } from './pois';
import type { GearCat, GearItem, GearSet, GearSetOverride } from './gear';
import type { Notif } from './notifications';
import type { Track } from './tracks';

export interface DataValue {
  userId: string;
  profile: UserProfile;
  profileLoading: boolean;
  updateProfile: (field: string, value: string) => Promise<void>;
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
  updateRoute: (id: string, patch: Partial<Poi>) => Promise<void>;
  deleteJourney: (id: string) => Promise<void>;
  restoreJourney: (id: string) => Promise<void>;
  permanentlyDeleteJourney: (id: string) => Promise<void>;
  leaveJourney: (id: string) => Promise<void>;
  toggleFav: (id: string, current: boolean) => Promise<void>;
  refetchJourneys: () => Promise<Poi[]>;
  refetchRoutes: () => Promise<void>;
  tracks: Track[];
  tracksLoading: boolean;
  createTrack: (draft: TrackDraft) => Promise<Track | null>;
  updateTrack: (id: string, patch: Partial<TrackDraft>) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  deleteTracks: (ids: string[]) => Promise<void>;
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
  refetchGear: () => Promise<void>;
  notifList: Notif[];
  notifUnread: number;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { routes, loading: routesLoading, updateRoute, refetch: refetchRoutes } = useRoutes(userId);
  const {
    tracks, loading: tracksLoading,
    createTrack, updateTrack, deleteTrack, deleteTracks,
    refetch: refetchTracks,
  } = useTracks(userId);
  const {
    journeys, trashedJourneys, loading: journeysLoading,
    createJourney, updateJourney, deleteJourney, restoreJourney, permanentlyDeleteJourney, leaveJourney, toggleFav,
    refetch: refetchJourneys,
  } = useJourneys(userId);
  const {
    cats, items, sets, loading: gearLoading,
    addCat, updateCat, deleteCat,
    addItem, updateItem, deleteItem,
    addSet, updateSet, deleteSet,
    refetch: refetchGear,
  } = useGear(userId);
  const {
    profile, loading: profileLoading, updateProfile, completeOnboarding, updateAvatar,
  } = useProfile(userId);
  const {
    planningProfile, loading: planningProfileLoading, savePlanningProfile,
  } = usePlanningProfile(userId);
  const {
    list: notifList, unread: notifUnread,
    markRead: markNotifRead, markAllRead: markAllNotifsRead,
  } = useNotifications(userId);

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

  const value: DataValue = {
    userId,
    profile, profileLoading, updateProfile, completeOnboarding, updateAvatar,
    planningProfile, planningProfileLoading, savePlanningProfile,
    routes, routesLoading,
    tracks, tracksLoading, createTrack, updateTrack, deleteTrack, deleteTracks: removeTracks, refetchTracks,
    journeys, trashedJourneys, journeysLoading, createJourney, updateJourney, updateRoute, deleteJourney, restoreJourney, permanentlyDeleteJourney, leaveJourney, toggleFav, refetchJourneys, refetchRoutes,
    cats, items, sets, gearLoading,
    addCat, updateCat, deleteCat,
    addItem, updateItem, deleteItem,
    addSet, updateSet, deleteSet,
    refetchGear,
    notifList, notifUnread, markNotifRead, markAllNotifsRead,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used within DataProvider');
  return v;
}
