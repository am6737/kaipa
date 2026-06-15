import React, { createContext, useContext } from 'react';
import { useRoutes } from '../hooks/useRoutes';
import { useJourneys } from '../hooks/useJourneys';
import { useGear } from '../hooks/useGear';
import { useNotifications } from '../hooks/useNotifications';
import type { Poi } from './pois';
import type { GearCat, GearItem, GearSet } from './gear';
import type { Notif } from './notifications';

export interface DataValue {
  userId: string;
  routes: Poi[];
  routesLoading: boolean;
  journeys: Poi[];
  journeysLoading: boolean;
  createJourney: (poi: Partial<Poi>) => Promise<Poi | null>;
  updateJourney: (id: string, patch: Partial<Poi>) => Promise<void>;
  deleteJourney: (id: string) => Promise<void>;
  toggleFav: (id: string, current: boolean) => Promise<void>;
  refetchJourneys: () => Promise<void>;
  cats: GearCat[];
  items: GearItem[];
  sets: GearSet[];
  gearLoading: boolean;
  addCat: (cat: Omit<GearCat, 'id' | 'builtin'>) => Promise<void>;
  updateCat: (id: string, patch: Partial<GearCat>) => Promise<void>;
  deleteCat: (id: string) => Promise<void>;
  addItem: (item: Omit<GearItem, 'id'>) => Promise<void>;
  updateItem: (id: number, patch: Partial<GearItem>) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  addSet: (name: string, itemIds: number[]) => Promise<void>;
  updateSet: (id: string, name: string, itemIds: number[]) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  refetchGear: () => Promise<void>;
  notifList: Notif[];
  notifUnread: number;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { routes, loading: routesLoading } = useRoutes();
  const {
    journeys, loading: journeysLoading,
    createJourney, updateJourney, deleteJourney, toggleFav,
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
    list: notifList, unread: notifUnread,
    markRead: markNotifRead, markAllRead: markAllNotifsRead,
  } = useNotifications(userId);

  const value: DataValue = {
    userId,
    routes, routesLoading,
    journeys, journeysLoading, createJourney, updateJourney, deleteJourney, toggleFav, refetchJourneys,
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
