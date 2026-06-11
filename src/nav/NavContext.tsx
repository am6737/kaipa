// NavContext.tsx — central UI/navigation state, mirroring the prototype's `nav`
// object: which tab + subtab is active, the selected POI, the bottom sheet, live
// journey edits (status flips / favourites / removals), and every full-screen
// overlay. Screens read this via useNav().
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Poi } from '../data/pois';

export type MainTab = 'discover' | 'gear' | 'me';
export type SubTab = 'explore' | 'memory';

export type JourneyPatch = Partial<Poi>;

export interface ActionSheetItem {
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  icon?: string;
}
export interface ActionSheetConfig {
  title?: string;
  message?: string;
  items: ActionSheetItem[];
}

interface OverlayCfg {
  info: Poi;
  isMine?: boolean;
  title?: string;
  status?: string;
}

export interface NavValue {
  mainTab: MainTab;
  subTab: SubTab;
  setMainTab: (t: MainTab) => void;
  setSubTab: (t: SubTab) => void;

  // selected POI + bottom sheet
  pointInfo: Poi | null;
  pointSource: Poi | null;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  openSheet: () => void;
  closeSheet: () => void;
  openPoint: (p: Poi, source?: Poi | null) => void;
  closePoint: () => void;

  // full-screen journey card
  detail: Poi | null;
  openDetail: (p: Poi) => void;
  closeDetail: () => void;

  // live edits
  journeyPatch: Record<string, JourneyPatch>;
  removedIds: string[];
  patchCurrent: (patch: JourneyPatch) => void;
  startJourney: () => void;
  completeJourney: () => void;
  removeJourney: () => void;
  toggleFav: () => void;
  merged: (p: Poi) => Poi;

  // overlays
  actionSheet: ActionSheetConfig | null;
  openActionSheet: (c: ActionSheetConfig) => void;
  closeActionSheet: () => void;

  addRouteOpen: boolean;
  openAddRoute: () => void;
  closeAddRoute: () => void;

  elevFull: OverlayCfg | null;
  openElevation: (c: OverlayCfg) => void;
  closeElevation: () => void;

  photoWall: (OverlayCfg & { mode?: string }) | null;
  openPhotoWall: (c: OverlayCfg & { mode?: string }) => void;
  closePhotoWall: () => void;

  // saved / joined
  savedRoutes: Poi[];
  extraJourneys: Poi[];
  addSavedRoute: (p: Poi) => void;
  addJoinedJourney: (p: Poi) => void;

  // toast
  toast: string | null;
  showToast: (msg: string) => void;

  auth: { signOut: () => void };
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({
  children,
  auth,
}: {
  children: React.ReactNode;
  auth: { signOut: () => void };
}) {
  const [mainTab, setMainTabRaw] = useState<MainTab>('discover');
  const [subTab, setSubTabRaw] = useState<SubTab>('explore');
  const [pointInfo, setPointInfo] = useState<Poi | null>(null);
  const [pointSource, setPointSource] = useState<Poi | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<Poi | null>(null);
  const [journeyPatch, setJourneyPatch] = useState<Record<string, JourneyPatch>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [actionSheet, setActionSheet] = useState<ActionSheetConfig | null>(null);
  const [addRouteOpen, setAddRouteOpen] = useState(false);
  const [elevFull, setElevFull] = useState<OverlayCfg | null>(null);
  const [photoWall, setPhotoWall] = useState<(OverlayCfg & { mode?: string }) | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<Poi[]>([]);
  const [extraJourneys, setExtraJourneys] = useState<Poi[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 1900);
  };

  const merged = (p: Poi): Poi => (p && p.id && journeyPatch[p.id] ? { ...p, ...journeyPatch[p.id] } : p);

  const closeOverlays = () => {
    setActionSheet(null);
    setAddRouteOpen(false);
    setElevFull(null);
    setPhotoWall(null);
  };

  const setMainTab = (t: MainTab) => {
    if (t === 'discover' && mainTab === 'discover') {
      setSheetOpen((v) => !v);
      return;
    }
    setMainTabRaw(t);
    setDetail(null);
    setSheetOpen(false);
    setPointInfo(null);
    setPointSource(null);
    closeOverlays();
  };
  const setSubTab = (t: SubTab) => {
    setSubTabRaw(t);
    setDetail(null);
    setSheetOpen(false);
    setPointInfo(null);
    setPointSource(null);
    closeOverlays();
  };

  const patchCurrent = (patch: JourneyPatch) => {
    const cur = pointInfo || detail;
    const id = cur?.id;
    if (id) setJourneyPatch((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
    setPointInfo((p) => (p ? { ...p, ...patch } : p));
    setDetail((d) => (d ? { ...d, ...patch } : d));
  };
  const removeCurrent = () => {
    const cur = pointInfo || detail;
    const id = cur?.id;
    if (id) setRemovedIds((s) => (s.includes(id) ? s : [...s, id]));
    setActionSheet(null);
    setPointInfo(null);
    setDetail(null);
    setSheetOpen(false);
  };

  const value = useMemo<NavValue>(
    () => ({
      mainTab,
      subTab,
      setMainTab,
      setSubTab,
      pointInfo,
      pointSource,
      sheetOpen,
      setSheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => {
        setSheetOpen(false);
        setPointInfo(null);
        setPointSource(null);
      },
      openPoint: (p, source) => {
        setActionSheet(null);
        setAddRouteOpen(false);
        setPointInfo(merged(p));
        setSheetOpen(true);
        setPointSource(source || null);
      },
      closePoint: () => {
        setPointInfo(null);
        setPointSource(null);
      },
      detail,
      openDetail: (p) => setDetail(merged(p)),
      closeDetail: () => setDetail(null),
      journeyPatch,
      removedIds,
      patchCurrent,
      startJourney: () => patchCurrent({ status: 'ongoing', dayIndex: 1 }),
      completeJourney: () => patchCurrent({ status: 'completed' }),
      removeJourney: removeCurrent,
      toggleFav: () => {
        const cur = pointInfo;
        patchCurrent({ fav: !(cur && cur.fav) });
      },
      merged,
      actionSheet,
      openActionSheet: (c) => setActionSheet(c),
      closeActionSheet: () => setActionSheet(null),
      addRouteOpen,
      openAddRoute: () => setAddRouteOpen(true),
      closeAddRoute: () => setAddRouteOpen(false),
      elevFull,
      openElevation: (c) => setElevFull(c),
      closeElevation: () => setElevFull(null),
      photoWall,
      openPhotoWall: (c) => setPhotoWall(c),
      closePhotoWall: () => setPhotoWall(null),
      savedRoutes,
      extraJourneys,
      addSavedRoute: (p) => setSavedRoutes((s) => [p, ...s]),
      addJoinedJourney: (p) => setExtraJourneys((s) => (s.some((x) => x.id === p.id) ? s : [p, ...s])),
      toast,
      showToast,
      auth,
    }),
    [
      mainTab,
      subTab,
      pointInfo,
      pointSource,
      sheetOpen,
      detail,
      journeyPatch,
      removedIds,
      actionSheet,
      addRouteOpen,
      elevFull,
      photoWall,
      savedRoutes,
      extraJourneys,
      toast,
    ]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav must be used within NavProvider');
  return v;
}
