// NavContext.tsx — central UI/navigation state, mirroring the prototype's `nav`
// object: which tab + discover subtab is active, the selected POI, the bottom
// sheet, live
// journey edits (favourites / removals), and every full-screen
// overlay. Screens read this via useNav().
import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Poi } from '../data/pois';
import { TLRow } from '../data/timeline';
import type { JourneyVersion } from '../hooks/useJourneyVersions';
import { reverseRoute } from '../lib/routeDirection';
import { launchRegion } from '../lib/launchRegion';
import type { AgentIntent } from '../lib/appAgent';

export type MainTab = 'discover' | 'journey' | 'gear' | 'me';
export type GearPageRequest = 'sets' | 'items';
export type JourneyTabRequest = { journeyId: string; tab?: 'checklist'; day?: string };
/** Curated route lists opened from the journey starter cards. */
export type RouteTopic = 'season' | 'easy' | 'hard';

export type JourneyPatch = Partial<Poi>;

export interface ActionSheetItem {
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  icon?: string;
}
// 主页与粉丝列表可以互相点进去，所以是一个栈；返回只弹出最上面一页。
export type SocialPage =
  | { kind: 'profile'; userId: string }
  | { kind: 'people'; userId: string; tab: 'followers' | 'following' | 'find' }
  | { kind: 'gearSet'; setId: string };

export interface ActionSheetConfig {
  title?: string;
  message?: string;
  items: ActionSheetItem[];
}

interface OverlayCfg {
  info: Poi;
  isMine?: boolean;
  title?: string;
}

export interface RouteGuideRequest {
  route: Poi;
  view: 'guides' | 'guide' | 'weather' | 'comments';
  guideId?: string;
  planId?: string;
  entry?: 'guide' | 'chat';
  trekStartDate?: string | null;
  /** Focus the comment composer when opening the comments view. */
  compose?: boolean;
  /** The route card is set to walk the route from its recorded finish. */
  reversed?: boolean;
}

export interface NavValue {
  mainTab: MainTab;
  setMainTab: (t: MainTab) => void;

  // Cross-feature navigation into the gear detail page.
  gearItemRequestId: number | null;
  openGearItem: (itemId: number) => void;
  clearGearItemRequest: () => void;
  gearSetRequestId: string | null;
  openGearSet: (setId: string) => void;
  clearGearSetRequest: () => void;
  gearPageRequest: GearPageRequest | null;
  openGearPage: (page: GearPageRequest) => void;
  clearGearPageRequest: () => void;
  /** Asks the journey detail to open on a tab or day, e.g. where the assistant just made changes. */
  journeyTabRequest: JourneyTabRequest | null;
  requestJourneyTab: (request: JourneyTabRequest) => void;
  clearJourneyTabRequest: () => void;

  // selected POI + bottom sheet
  pointInfo: Poi | null;
  pointSource: Poi | null;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  openSheet: () => void;
  closeSheet: () => void;
  openPoint: (p: Poi, source?: Poi | null) => void;
  closePoint: () => void;

  // live edits
  journeyPatch: Record<string, JourneyPatch>;
  removedIds: string[];
  patchCurrent: (patch: JourneyPatch) => void;
  removeJourney: () => void;
  removeJourneys: (ids: string[]) => void;
  clearRemovedJourney: (id: string) => void;
  toggleFav: () => void;
  merged: (p: Poi) => Poi;

  // Any modal or pushed overlay that should suspend controls belonging to the
  // underlying screen (floating edit bars, bottom tabs, etc.).
  blockingOverlayOpen: boolean;

  routeGuide: RouteGuideRequest | null;
  openRouteGuide: (request: RouteGuideRequest) => void;
  closeRouteGuide: () => void;

  // overlays
  actionSheet: ActionSheetConfig | null;
  openActionSheet: (c: ActionSheetConfig) => void;
  closeActionSheet: () => void;

  addRouteOpen: boolean;
  openAddRoute: () => void;
  closeAddRoute: () => void;
  routeRequestOpen: boolean;
  routeRequestPrefill?: string;
  openRouteRequest: (prefill?: string) => void;
  closeRouteRequest: () => void;

  // 新增旅程 flow (旅程 tab "+")
  newJourneyOpen: boolean;
  newJourneyPreset: Poi | null;
  /** `reversed` plans the preset route from its recorded finish. */
  openNewJourney: (preset?: Poi, options?: { reversed?: boolean }) => void;
  closeNewJourney: () => void;

  journeyInviteScannerOpen: boolean;
  openJourneyInviteScanner: () => void;
  closeJourneyInviteScanner: () => void;
  journeyCodeEntryOpen: boolean;
  openJourneyCodeEntry: () => void;
  closeJourneyCodeEntry: () => void;
  itineraryImportOpen: boolean;
  openItineraryImport: () => void;
  closeItineraryImport: () => void;
  routeTopic: RouteTopic | null;
  openRouteTopic: (topic: RouteTopic) => void;
  closeRouteTopic: () => void;
  plusPosterOpen: boolean;
  openPlusPoster: () => void;
  closePlusPoster: () => void;
  /** Set when another tab asks 我的 to show the membership page. */
  membershipPageRequest: boolean;
  openMembershipPage: () => void;
  clearMembershipPageRequest: () => void;
  /** Set when another layer asks 我的 to show one library track, e.g. one just saved. */
  trackPageRequest: string | null;
  openTrackPage: (trackId: string) => void;
  clearTrackPageRequest: () => void;

  elevFull: OverlayCfg | null;
  openElevation: (c: OverlayCfg) => void;
  closeElevation: () => void;

  photoWall: (OverlayCfg & { mode?: string }) | null;
  openPhotoWall: (c: OverlayCfg & { mode?: string }) => void;
  closePhotoWall: () => void;

  // direct 旅程 entry editor (journey detail → 旅程 → 添加/编辑) — pops the editor straight up
  timelineAdd: { poi: Poi; day?: string; editRow?: TLRow; groups?: string[] } | null;
  openTimelineAdd: (p: Poi, day?: string, groups?: string[]) => void;
  openTimelineEdit: (p: Poi, row: TLRow, groups?: string[]) => void;
  closeTimelineAdd: () => void;

  // journey "更多" surfaces (edit info / settings)
  editJourney: Poi | null;
  openEditJourney: (p: Poi) => void;
  closeEditJourney: () => void;

  journeySettings: Poi | null;
  openJourneySettings: (p: Poi) => void;
  closeJourneySettings: () => void;

  socialStack: SocialPage[];
  openUserProfile: (userId: string) => void;
  openPeople: (userId: string, tab: 'followers' | 'following' | 'find') => void;
  /** 别人公开的装备清单，可以「存为我的清单」。 */
  openGearSetPreview: (setId: string) => void;
  closeSocialPage: () => void;

  journeyHistory: Poi | null;
  openJourneyHistory: (p: Poi) => void;
  closeJourneyHistory: () => void;
  journeyVersionPreview: { poi: Poi; sourcePoi: Poi; version: JourneyVersion } | null;
  openJourneyVersionPreview: (poi: Poi, sourcePoi: Poi, version: JourneyVersion) => void;
  closeJourneyVersionPreview: () => void;
  completeJourneyVersionPreview: (poi: Poi) => void;
  syncJourney: (p: Poi) => void;

  // 现场分享 (offline live share) host control sheet
  liveShare: Poi | null;
  openLiveShare: (p: Poi) => void;
  closeLiveShare: () => void;

  // 加入附近的现场分享 (guest discovery + join)
  nearbyJoinOpen: boolean;
  openNearbyJoin: () => void;
  closeNearbyJoin: () => void;

  // 同行管理 (journey detail → 同行 → 管理)
  manageCompanions: { poi: Poi; initialAction?: 'invite' } | null;
  openManageCompanions: (p: Poi, initialAction?: 'invite') => void;
  closeManageCompanions: () => void;

  // saved / joined
  savedRoutes: Poi[];
  extraJourneys: Poi[];
  addSavedRoute: (p: Poi) => void;
  addJoinedJourney: (p: Poi) => Promise<Poi | null>;

  // share panel
  sharePanel: Poi | null;
  openSharePanel: (p: Poi) => void;
  closeSharePanel: () => void;

  // search overlay
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  discoverRegion: string;
  setDiscoverRegion: (region: string) => void;

  // Global in-app agent. Feature pages may provide a prompt and current journey.
  assistantOpen: boolean;
  assistantPrompt?: string;
  assistantDisplayPrompt?: string;
  assistantJourneyId?: string;
  assistantAutoSubmit: boolean;
  // Sent with an auto-submitted prompt; plan_journey when not given.
  assistantIntent?: AgentIntent;
  assistantStartNewConversation: boolean;
  openAssistant: (prompt?: string, journeyId?: string, autoSubmit?: boolean, displayPrompt?: string, startNewConversation?: boolean, intent?: AgentIntent) => void;
  clearAssistantPrompt: () => void;
  closeAssistant: () => void;

  // toast
  toast: { message: string; placement: 'top' | 'bottom' } | null;
  showToast: (msg: string, placement?: 'top' | 'bottom') => void;

  // hide the floating tab bar while a full-screen pushed page is open
  // (e.g. the 我 screen's 账户与登录 / 消息中心 sub-pages).
  tabBarHidden: boolean;
  setTabBarHidden: (source: string, hidden: boolean) => void;

  auth: { signOut: () => void; deleteAccount: () => Promise<void> };
}

const NavContext = createContext<NavValue | null>(null);

export interface NavDB {
  updateJourney?: (id: string, patch: Partial<Poi>) => Promise<void>;
  updateRoute?: (id: string, patch: Partial<Poi>) => Promise<void>;
  deleteJourney?: (id: string) => Promise<void>;
  toggleFav?: (id: string, current: boolean) => Promise<void>;
  toggleRouteFavorite?: (id: string, current: boolean) => Promise<void>;
  createJourney?: (poi: Partial<Poi>) => Promise<Poi | null>;
}

export function NavProvider({
  children,
  auth,
  db,
}: {
  children: React.ReactNode;
  auth: { signOut: () => void; deleteAccount: () => Promise<void> };
  db?: NavDB;
}) {
  const [mainTab, setMainTabRaw] = useState<MainTab>('discover');
  const [gearItemRequestId, setGearItemRequestId] = useState<number | null>(null);
  const [gearSetRequestId, setGearSetRequestId] = useState<string | null>(null);
  const [journeyTabRequest, setJourneyTabRequest] = useState<JourneyTabRequest | null>(null);
  const [gearPageRequest, setGearPageRequest] = useState<GearPageRequest | null>(null);
  const [pointInfo, setPointInfo] = useState<Poi | null>(null);
  const [pointSource, setPointSource] = useState<Poi | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [journeyPatch, setJourneyPatch] = useState<Record<string, JourneyPatch>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [actionSheet, setActionSheet] = useState<ActionSheetConfig | null>(null);
  const [addRouteOpen, setAddRouteOpen] = useState(false);
  const [routeRequestOpen, setRouteRequestOpen] = useState(false);
  const [routeRequestPrefill, setRouteRequestPrefill] = useState<string>();
  const [routeGuide, setRouteGuide] = useState<RouteGuideRequest | null>(null);
  const [newJourneyOpen, setNewJourneyOpen] = useState(false);
  const [newJourneyPreset, setNewJourneyPreset] = useState<Poi | null>(null);
  const [journeyInviteScannerOpen, setJourneyInviteScannerOpen] = useState(false);
  const [journeyCodeEntryOpen, setJourneyCodeEntryOpen] = useState(false);
  const [itineraryImportOpen, setItineraryImportOpen] = useState(false);
  const [routeTopic, setRouteTopic] = useState<RouteTopic | null>(null);
  const [plusPosterOpen, setPlusPosterOpen] = useState(false);
  const [membershipPageRequest, setMembershipPageRequest] = useState(false);
  const [trackPageRequest, setTrackPageRequest] = useState<string | null>(null);
  const [elevFull, setElevFull] = useState<OverlayCfg | null>(null);
  const [photoWall, setPhotoWall] = useState<(OverlayCfg & { mode?: string }) | null>(null);
  const [timelineAdd, setTimelineAdd] = useState<{ poi: Poi; day?: string; editRow?: TLRow; groups?: string[] } | null>(null);
  const [editJourney, setEditJourney] = useState<Poi | null>(null);
  const [journeySettings, setJourneySettings] = useState<Poi | null>(null);
  const [journeyHistory, setJourneyHistory] = useState<Poi | null>(null);
  const [socialStack, setSocialStack] = useState<SocialPage[]>([]);
  const [journeyVersionPreview, setJourneyVersionPreview] = useState<{ poi: Poi; sourcePoi: Poi; version: JourneyVersion } | null>(null);
  const [liveShare, setLiveShare] = useState<Poi | null>(null);
  const [nearbyJoinOpen, setNearbyJoinOpen] = useState(false);
  const [manageCompanions, setManageCompanions] = useState<{ poi: Poi; initialAction?: 'invite' } | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<Poi[]>([]);
  const [extraJourneys, setExtraJourneys] = useState<Poi[]>([]);
  const [sharePanel, setSharePanel] = useState<Poi | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [discoverRegion, setDiscoverRegion] = useState(launchRegion);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState<string>();
  const [assistantDisplayPrompt, setAssistantDisplayPrompt] = useState<string>();
  const [assistantJourneyId, setAssistantJourneyId] = useState<string>();
  const [assistantAutoSubmit, setAssistantAutoSubmit] = useState(false);
  const [assistantIntent, setAssistantIntent] = useState<AgentIntent>();
  const [assistantStartNewConversation, setAssistantStartNewConversation] = useState(false);
  const [toast, setToast] = useState<{ message: string; placement: 'top' | 'bottom' } | null>(null);
  const [tabBarHiddenSources, setTabBarHiddenSources] = useState<Set<string>>(() => new Set());
  const setTabBarHidden = useCallback((source: string, hidden: boolean) => {
    setTabBarHiddenSources((current) => {
      const alreadyHidden = current.has(source);
      if (alreadyHidden === hidden) return current;
      const next = new Set(current);
      if (hidden) next.add(source);
      else next.delete(source);
      return next;
    });
  }, []);
  const tabBarHidden = tabBarHiddenSources.size > 0;

  const blockingOverlayOpen = Boolean(
    routeGuide ||
    actionSheet ||
    addRouteOpen ||
    routeRequestOpen ||
    newJourneyOpen ||
    journeyInviteScannerOpen ||
    journeyCodeEntryOpen ||
    itineraryImportOpen ||
    routeTopic ||
    plusPosterOpen ||
    elevFull ||
    photoWall ||
    timelineAdd ||
    editJourney ||
    journeySettings ||
    journeyHistory ||
    socialStack.length > 0 ||
    liveShare ||
    nearbyJoinOpen ||
    manageCompanions ||
    sharePanel ||
    searchOpen ||
    assistantOpen
  );

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const showToast = (msg: string, placement: 'top' | 'bottom' = 'bottom') => {
    setToast({ message: msg, placement });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 1900);
  };

  const merged = (p: Poi): Poi => (p && p.id && journeyPatch[p.id] ? { ...p, ...journeyPatch[p.id] } : p);

  const closeOverlays = () => {
    setRouteGuide(null);
    setActionSheet(null);
    setAddRouteOpen(false);
    setRouteRequestOpen(false);
    setRouteRequestPrefill(undefined);
    setNewJourneyOpen(false);
    setNewJourneyPreset(null);
    setJourneyInviteScannerOpen(false);
    setJourneyCodeEntryOpen(false);
    setItineraryImportOpen(false);
    setRouteTopic(null);
    setPlusPosterOpen(false);
    setElevFull(null);
    setPhotoWall(null);
    setTimelineAdd(null);
    setEditJourney(null);
    setJourneySettings(null);
    setJourneyHistory(null);
    setSocialStack([]);
    setJourneyVersionPreview(null);
    setLiveShare(null);
    setNearbyJoinOpen(false);
    setManageCompanions(null);
    setSharePanel(null);
    setSearchOpen(false);
    setAssistantOpen(false);
    setAssistantPrompt(undefined);
    setAssistantDisplayPrompt(undefined);
    setAssistantJourneyId(undefined);
    setAssistantAutoSubmit(false);
  };

  const setMainTab = (t: MainTab) => {
    // Repeat taps on 发现 no longer toggle the list sheet: the sheet belongs to the map.
    if (t === 'discover' && mainTab === 'discover') return;
    setMainTabRaw(t);
    setSheetOpen(false);
    setPointInfo(null);
    setPointSource(null);
    closeOverlays();
  };

  const patchCurrent = (patch: JourneyPatch) => {
    const cur = pointInfo;
    const id = cur?.id;
    if (id) {
      setJourneyPatch((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
      if (cur?.kind === 'route') db?.updateRoute?.(id, patch);
      else db?.updateJourney?.(id, patch);
    }
    setPointInfo((p) => (p ? { ...p, ...patch } : p));
    setJourneySettings((s) => (s ? { ...s, ...patch } : s));
  };
  const removeCurrent = () => {
    const cur = pointInfo;
    const id = cur?.id;
    if (id && cur?.kind === 'journey' && cur.mine === true) {
      const operation = db?.deleteJourney?.(id);
      void operation?.then(() => {
        setRemovedIds((s) => (s.includes(id) ? s : [...s, id]));
      }).catch(() => {});
    }
    setActionSheet(null);
    setEditJourney(null);
    setJourneySettings(null);
    setPointInfo(null);
    setSheetOpen(false);
  };
  const removeBatch = (ids: string[]) => {
    ids.forEach((id) => {
      const operation = db?.deleteJourney?.(id);
      void operation?.then(() => {
        setRemovedIds((current) => current.includes(id) ? current : [...current, id]);
      }).catch(() => {});
    });
  };

  const value = useMemo<NavValue>(
    () => ({
      mainTab,
      setMainTab,
      gearItemRequestId,
      openGearItem: (itemId) => {
        setGearPageRequest(null);
        setGearSetRequestId(null);
        setGearItemRequestId(itemId);
        setMainTab('gear');
      },
      clearGearItemRequest: () => setGearItemRequestId(null),
      gearSetRequestId,
      openGearSet: (setId) => {
        setGearPageRequest(null);
        setGearItemRequestId(null);
        setGearSetRequestId(setId);
        setMainTab('gear');
      },
      clearGearSetRequest: () => setGearSetRequestId(null),
      gearPageRequest,
      openGearPage: (page) => {
        setGearItemRequestId(null);
        setGearSetRequestId(null);
        setGearPageRequest(page);
        setMainTab('gear');
      },
      clearGearPageRequest: () => setGearPageRequest(null),
      journeyTabRequest,
      requestJourneyTab: (request) => setJourneyTabRequest(request),
      clearJourneyTabRequest: () => setJourneyTabRequest(null),
      pointInfo,
      pointSource,
      sheetOpen,
      setSheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => {
        setSheetOpen(false);
        setPointInfo(null);
        setPointSource(null);
        setJourneyVersionPreview(null);
      },
      openPoint: (p, source) => {
        setActionSheet(null);
        setAddRouteOpen(false);
        // Details render under the tab screens; a topic page on top would hide them.
        setRouteTopic(null);
        setJourneyVersionPreview(null);
        setPointInfo(merged(p));
        setSheetOpen(true);
        setPointSource(source || null);
      },
      closePoint: () => {
        setPointInfo(null);
        setPointSource(null);
        setJourneyVersionPreview(null);
      },
      journeyPatch,
      removedIds,
      patchCurrent,
      removeJourney: removeCurrent,
      removeJourneys: removeBatch,
      clearRemovedJourney: (id) => setRemovedIds((current) => current.filter((removedId) => removedId !== id)),
      toggleFav: () => {
        const cur = pointInfo;
        const newFav = !(cur && cur.fav);
        patchCurrent({ fav: newFav });
        if (cur?.id) {
          const operation = cur.kind === 'route'
            ? db?.toggleRouteFavorite?.(cur.id, cur.fav ?? false)
            : db?.toggleFav?.(cur.id, cur.fav ?? false);
          void operation;
        }
      },
      merged,
      blockingOverlayOpen,
      routeGuide,
      openRouteGuide: (request) => setRouteGuide(request),
      closeRouteGuide: () => setRouteGuide(null),
      actionSheet,
      openActionSheet: (c) => setActionSheet(c),
      closeActionSheet: () => setActionSheet(null),
      addRouteOpen,
      openAddRoute: () => setAddRouteOpen(true),
      closeAddRoute: () => setAddRouteOpen(false),
      routeRequestOpen,
      routeRequestPrefill,
      openRouteRequest: (prefill?: string) => { setRouteRequestPrefill(prefill); setRouteRequestOpen(true); },
      closeRouteRequest: () => { setRouteRequestOpen(false); setRouteRequestPrefill(undefined); },
      newJourneyOpen,
      newJourneyPreset,
      openNewJourney: (preset?: Poi, options?: { reversed?: boolean }) => {
        // Reverse after merging, so a stored patch can't put the forward climb back.
        const route = preset ? merged(preset) : null;
        setNewJourneyPreset(route && options?.reversed ? reverseRoute(route) : route);
        setNewJourneyOpen(true);
      },
      closeNewJourney: () => {
        setNewJourneyOpen(false);
        setNewJourneyPreset(null);
      },
      journeyInviteScannerOpen,
      openJourneyInviteScanner: () => setJourneyInviteScannerOpen(true),
      closeJourneyInviteScanner: () => setJourneyInviteScannerOpen(false),
      journeyCodeEntryOpen,
      openJourneyCodeEntry: () => setJourneyCodeEntryOpen(true),
      closeJourneyCodeEntry: () => setJourneyCodeEntryOpen(false),
      itineraryImportOpen,
      openItineraryImport: () => setItineraryImportOpen(true),
      closeItineraryImport: () => setItineraryImportOpen(false),
      routeTopic,
      openRouteTopic: (topic) => setRouteTopic(topic),
      closeRouteTopic: () => setRouteTopic(null),
      plusPosterOpen,
      openPlusPoster: () => setPlusPosterOpen(true),
      closePlusPoster: () => setPlusPosterOpen(false),
      membershipPageRequest,
      openMembershipPage: () => {
        setPlusPosterOpen(false);
        setMembershipPageRequest(true);
        setMainTab('me');
      },
      clearMembershipPageRequest: () => setMembershipPageRequest(false),
      trackPageRequest,
      openTrackPage: (trackId) => {
        setTrackPageRequest(trackId);
        setMainTab('me');
      },
      clearTrackPageRequest: () => setTrackPageRequest(null),
      elevFull,
      openElevation: (c) => setElevFull(c),
      closeElevation: () => setElevFull(null),
      photoWall,
      openPhotoWall: (c) => setPhotoWall(c),
      closePhotoWall: () => setPhotoWall(null),
      timelineAdd,
      openTimelineAdd: (p, day, groups) => setTimelineAdd({ poi: merged(p), day, groups }),
      openTimelineEdit: (p, row, groups) => setTimelineAdd({ poi: merged(p), editRow: row, groups }),
      closeTimelineAdd: () => setTimelineAdd(null),
      editJourney,
      openEditJourney: (p) => setEditJourney(merged(p)),
      closeEditJourney: () => setEditJourney(null),
      journeySettings,
      openJourneySettings: (p) => {
        const next = merged(p);
        if (next.kind === 'journey' && next.mine !== true) return;
        setJourneySettings(next);
      },
      closeJourneySettings: () => setJourneySettings(null),
      socialStack,
      // 同一个人已经在栈顶就不再叠一层（比如在 TA 的粉丝列表里点回 TA）。
      openUserProfile: (userId) => setSocialStack((stack) => {
        const top = stack[stack.length - 1];
        return top?.kind === 'profile' && top.userId === userId ? stack : [...stack, { kind: 'profile', userId }];
      }),
      openPeople: (userId, tab) => setSocialStack((stack) => [...stack, { kind: 'people', userId, tab }]),
      openGearSetPreview: (setId) => setSocialStack((stack) => [...stack, { kind: 'gearSet', setId }]),
      closeSocialPage: () => setSocialStack((stack) => stack.slice(0, -1)),
      journeyHistory,
      openJourneyHistory: (p) => setJourneyHistory(merged(p)),
      closeJourneyHistory: () => setJourneyHistory(null),
      journeyVersionPreview,
      openJourneyVersionPreview: (poi, sourcePoi, version) => {
        setJourneyHistory(null);
        setPointInfo(poi);
        setPointSource(null);
        setSheetOpen(true);
        setJourneyVersionPreview({ poi, sourcePoi, version });
      },
      closeJourneyVersionPreview: () => {
        const sourcePoi = journeyVersionPreview?.sourcePoi;
        setJourneyVersionPreview(null);
        if (sourcePoi) {
          setPointInfo(merged(sourcePoi));
          setJourneyHistory(merged(sourcePoi));
        }
      },
      completeJourneyVersionPreview: (p) => {
        setJourneyVersionPreview(null);
        setPointInfo(p);
        setPointSource(null);
        setSheetOpen(true);
      },
      syncJourney: (p) => {
        setJourneyPatch((current) => {
          if (!current[p.id]) return current;
          const next = { ...current };
          delete next[p.id];
          return next;
        });
        setPointInfo((current) => current?.id === p.id ? p : current);
        setJourneySettings((current) => current?.id === p.id ? p : current);
        setJourneyHistory((current) => current?.id === p.id ? p : current);
      },
      liveShare,
      openLiveShare: (p) => setLiveShare(merged(p)),
      closeLiveShare: () => setLiveShare(null),
      nearbyJoinOpen,
      openNearbyJoin: () => setNearbyJoinOpen(true),
      closeNearbyJoin: () => setNearbyJoinOpen(false),
      manageCompanions,
      openManageCompanions: (p, initialAction) => setManageCompanions({ poi: merged(p), initialAction }),
      closeManageCompanions: () => setManageCompanions(null),
      sharePanel,
      openSharePanel: (p: Poi) => setSharePanel(merged(p)),
      closeSharePanel: () => setSharePanel(null),
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      discoverRegion,
      setDiscoverRegion,
      assistantOpen,
      assistantPrompt,
      assistantDisplayPrompt,
      assistantJourneyId,
      assistantAutoSubmit,
      assistantIntent,
      assistantStartNewConversation,
      openAssistant: (prompt, journeyId, autoSubmit = false, displayPrompt, startNewConversation = false, intent) => {
        setAssistantPrompt(prompt);
        setAssistantDisplayPrompt(displayPrompt);
        setAssistantJourneyId(journeyId);
        setAssistantAutoSubmit(autoSubmit);
        setAssistantIntent(intent);
        setAssistantStartNewConversation(startNewConversation);
        setAssistantOpen(true);
      },
      clearAssistantPrompt: () => {
        setAssistantPrompt(undefined);
        setAssistantDisplayPrompt(undefined);
        setAssistantAutoSubmit(false);
        setAssistantIntent(undefined);
      },
      closeAssistant: () => {
        setAssistantOpen(false);
        setAssistantPrompt(undefined);
        setAssistantDisplayPrompt(undefined);
        setAssistantJourneyId(undefined);
        setAssistantAutoSubmit(false);
        setAssistantIntent(undefined);
        setAssistantStartNewConversation(false);
      },
      savedRoutes,
      extraJourneys,
      addSavedRoute: (p) => setSavedRoutes((s) => [p, ...s]),
      addJoinedJourney: async (p) => {
        try {
          const saved = await db?.createJourney?.(p);
          if (!saved) return null;
          setExtraJourneys((s) => (s.some((x) => x.id === saved.id) ? s : [saved, ...s]));
          return saved;
        } catch (error) {
          console.warn('[NavProvider] create journey error:', error);
          return null;
        }
      },
      toast,
      showToast,
      tabBarHidden,
      setTabBarHidden,
      auth,
    }),
    [
      mainTab,
      gearItemRequestId,
      gearSetRequestId,
      gearPageRequest,
      journeyTabRequest,
      pointInfo,
      pointSource,
      sheetOpen,
      journeyPatch,
      removedIds,
      actionSheet,
      addRouteOpen,
      routeRequestOpen,
      routeRequestPrefill,
      newJourneyOpen,
      newJourneyPreset,
      routeGuide,
      journeyInviteScannerOpen,
      journeyCodeEntryOpen,
      itineraryImportOpen,
      routeTopic,
      plusPosterOpen,
      membershipPageRequest,
      trackPageRequest,
      elevFull,
      photoWall,
      timelineAdd,
      editJourney,
      journeySettings,
      journeyHistory,
      socialStack,
      journeyVersionPreview,
      liveShare,
      nearbyJoinOpen,
      manageCompanions,
      sharePanel,
      searchOpen,
      discoverRegion,
      assistantOpen,
      assistantPrompt,
      assistantDisplayPrompt,
      assistantJourneyId,
      assistantAutoSubmit,
      assistantIntent,
      assistantStartNewConversation,
      savedRoutes,
      extraJourneys,
      toast,
      tabBarHidden,
    ]
  );

  return (
    <NavContext.Provider value={value}>{children}</NavContext.Provider>
  );
}

export function useNav(): NavValue {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav must be used within NavProvider');
  return v;
}

/**
 * Hands a hidden tab the nav value it was hidden with, so tab switches and
 * other nav changes stop re-rendering screens nobody can see. Every request
 * aimed at a tab also switches to it, which unfreezes it in the same render.
 */
export function FrozenNav({ frozen, covered = false, children }: { frozen: boolean; covered?: boolean; children: React.ReactNode }) {
  const live = useContext(NavContext);
  const held = useRef(live);
  const committedFrozen = useRef(frozen);
  // The render that hides the tab still takes the live value, so the screen
  // sees itself become inactive (mainTab moved, detail closed) before it freezes.
  // `covered` (a page or sheet opened over the tab) holds the value from that
  // very render: the tab has nothing to learn from the overlay opening, and
  // re-rendering it in the same commit delayed the overlay's entrance.
  // Refs move only on commit: a transition render may be thrown away and redone.
  const value = covered || (frozen && committedFrozen.current) ? held.current : live;
  useLayoutEffect(() => {
    held.current = value;
    committedFrozen.current = frozen;
  });
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
