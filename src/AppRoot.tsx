import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { useTheme } from './theme/AppearanceContext';
import { useI18n } from './i18n';
import { FrozenNav, NavProvider, useNav } from './nav/NavContext';
import { DataProvider, useData } from './data/DataContext';
import { MembershipProvider } from './membership/MembershipContext';
import { authStorageKey, supabase } from './lib/supabase';
import { clearOfflineCache } from './lib/offlineCache';
import { upgradeCurrentAnonymousSession } from './lib/auth';
import { createTrackFromFile, parseTrackFile, TrackFileError } from './lib/trackImport';
import { countRender, markTabCommit } from './lib/tabSwitchProbe';
import { AuthFlow } from './screens/AuthFlow';
import { OnboardingGate } from './screens/OnboardingFlow';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { JourneyScreen } from './screens/JourneyScreen';
import { GearScreen } from './screens/GearScreen';
import { MeScreen } from './screens/MeScreen';
import { BottomTabs } from './components/BottomTabs';
import { TabPage } from './components/TabPage';
import { MapPresentationProvider } from './components/maps/MapPresentationContext';
import { ActionSheet } from './components/overlays/ActionSheet';
import { AddRouteSheet } from './components/overlays/AddRouteSheet';
import { RouteRequestSheet } from './components/discover/RouteRequestSheet';
import { NewJourneySheet, NJSharePanel } from './components/overlays/NewJourneySheet';
import { ElevationFull } from './components/overlays/ElevationFull';
import { PhotoWall } from './components/overlays/PhotoWall';
import { JourneyEntryEditor } from './components/overlays/JourneyTimeline';
import { EditJourneySheet } from './components/overlays/EditJourneySheet';
import { JourneySettings } from './components/overlays/JourneySettings';
import { HostShareSheet } from './components/overlays/HostShareSheet';
import { NearbyJoinSheet } from './components/overlays/NearbyJoinSheet';
import { ManageCompanions } from './components/overlays/ManageCompanions';
import { JourneyShareSheet } from './components/overlays/JourneyShareSheet';
import { JourneyPassphraseSheet } from './components/overlays/JourneyPassphraseSheet';
import { JourneyCodeEntrySheet } from './components/overlays/JourneyCodeEntrySheet';
import { ItineraryImportPage } from './components/overlays/ItineraryImportPage';
import { JourneyVersionHistoryPage } from './components/journey/JourneyVersionHistoryPage';
import { SharePoster } from './components/overlays/SharePoster';
import { SearchScreen } from './screens/SearchScreen';
import { Toast } from './components/Toast';
import { TrailLayer } from './components/trail/TrailLayer';
import { TrailProvider } from './trail/TrailContext';
import { RouteGuidePage } from './components/discover/RouteGuidePage';
import { RouteTopicPage } from './components/discover/RouteTopicPage';
import { PlusPosterPage } from './components/me/PlusPosterPage';
import { AppAssistant } from './components/assistant/AppAssistant';
import { QrLoginScannerPage } from './components/auth/QrLoginScannerPage';
import { fetchJourneyPoiById } from './lib/journeyInvite';
import { joinJourneyByCode } from './lib/journeyShare';
import { PushBootstrap, PushNavigator } from './push/PushBootstrap';

function AppShell() {
  countRender('AppShell');
  const theme = useTheme();
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const { userId, journeys } = data;
  const [trackLoading, setTrackLoading] = useState(false);
  const [sharePosterPoi, setSharePosterPoi] = useState<typeof nav.sharePanel>(null);
  const [passphrasePoi, setPassphrasePoi] = useState<typeof nav.sharePanel>(null);
  const [assistantReturnJourneyId, setAssistantReturnJourneyId] = useState<string>();
  const [discoverOverlayOpen, setDiscoverOverlayOpen] = useState(false);
  const [searchOpaque, setSearchOpaque] = useState(false);

  useEffect(() => {
    markTabCommit();
  }, [nav.mainTab]);

  useEffect(() => {
    if (!assistantReturnJourneyId || nav.pointInfo || nav.assistantOpen) return;
    const journeyId = assistantReturnJourneyId;
    setAssistantReturnJourneyId(undefined);
    nav.openAssistant(undefined, journeyId);
  }, [assistantReturnJourneyId, nav.assistantOpen, nav.pointInfo]);

  const detailOpen = !!nav.pointInfo;
  // The discover list hides the bar itself above peek (setTabBarHidden). nav.sheetOpen
  // outlives a route card closed back to the list, so it must not hide the bar here.
  const tabsHidden = detailOpen || discoverOverlayOpen || nav.tabBarHidden || nav.blockingOverlayOpen || !!sharePosterPoi || !!passphrasePoi;
  const managedPoi = nav.manageCompanions
    ? journeys.find((journey) => journey.id === nav.manageCompanions?.poi.id) || nav.manageCompanions.poi
    : null;
  const directInvitePoi = nav.manageCompanions?.initialAction === 'invite'
    ? managedPoi
    : null;
  const directInviteElevations = directInvitePoi?.trackElevation
    ?.map((point) => point.ele)
    .filter(Number.isFinite) || [];
  const directInviteHighestElevation = directInviteElevations.length
    ? Math.max(...directInviteElevations)
    : undefined;
  const directInviteMetrics = directInvitePoi
    ? [
        directInvitePoi.days || directInvitePoi.totalDays
          ? {
              label: t('journey.stat.days'),
              value: directInvitePoi.days || t('journeyEdit.meta.days', { count: directInvitePoi.totalDays || 1 }),
            }
          : null,
        directInvitePoi.dist
          ? { label: t('journey.stat.distance'), value: directInvitePoi.dist }
          : null,
        directInviteHighestElevation != null
          ? {
              label: t('journey.stat.highest'),
              value: `${t('journey.stat.elevation')} ${Math.round(directInviteHighestElevation)} m`,
            }
          : null,
      ].filter((metric): metric is { label: string; value: string } => Boolean(metric))
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Own stacking context: TabPage raises the incoming page with zIndex,
          which must not lift it over the overlays rendered after this. */}
      <View style={StyleSheet.absoluteFill}>
        {/* iOS must never take Discover out of the hierarchy: a MapView that
            leaves and re-enters the window comes back with empty reused
            annotation views (every route pin gone), and unmounting it reloads
            the tiles, which reads as a flash. DiscoverScreen slides the map
            off-screen instead, via keepMapWarm. Android keeps the old teardown. */}
        <TabPage
          selected={nav.mainTab === 'discover'}
          forced={detailOpen}
          whenHidden={Platform.OS === 'android' && nav.mainTab !== 'journey' ? 'none' : 'keep'}
        >
          {(shown) => (
            <FrozenNav frozen={nav.mainTab !== 'discover' && !detailOpen}>
              <DiscoverScreen
                theme={theme}
                active={shown}
                keepMapWarm={Platform.OS === 'ios'}
                covered={nav.searchOpen && searchOpaque}
                externalOverlayOpen={Boolean(sharePosterPoi || passphrasePoi)}
                onBlockingOverlayChange={setDiscoverOverlayOpen}
              />
            </FrozenNav>
          )}
        </TabPage>
        {/* Kept laid out (like 我的) rather than display:none: un-hiding rebuilt the
            whole page's native views on every tab switch, which lagged the tap. */}
        <TabPage selected={nav.mainTab === 'journey'} covered={detailOpen} whenHidden="transparent">
          {() => (
            <FrozenNav frozen={nav.mainTab !== 'journey' || detailOpen}>
              <JourneyScreen theme={theme} />
            </FrozenNav>
          )}
        </TabPage>
        <TabPage selected={nav.mainTab === 'gear'} covered={detailOpen} whenHidden="none">
          {() => (
            <FrozenNav frozen={nav.mainTab !== 'gear' || detailOpen}>
              <GearScreen theme={theme} />
            </FrozenNav>
          )}
        </TabPage>
        <TabPage selected={nav.mainTab === 'me'} covered={detailOpen} whenHidden="transparent">
          {() => (
            <FrozenNav frozen={nav.mainTab !== 'me' || detailOpen}>
              <MeScreen theme={theme} />
            </FrozenNav>
          )}
        </TabPage>
      </View>
      <BottomTabs theme={theme} hidden={tabsHidden} />

      {nav.addRouteOpen && (
        <AddRouteSheet
          theme={theme}
          loading={trackLoading}
          onClose={() => { if (!trackLoading) nav.closeAddRoute(); }}
          onRequest={() => { nav.closeAddRoute(); nav.openRouteRequest(); }}
          onUpload={async () => {
            try {
              const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
              if (result.canceled || !result.result) return;
              setTrackLoading(true);
              try {
                const parsed = await parseTrackFile(result.result, t);
                const { track, archiveTrimmed } = await createTrackFromFile(parsed, { userId, sourceUri: result.result.uri, fileSize: result.result.size }, data.createTrack);
                // Tracks belong to the library first. A journey can point at the
                // new row; a route cannot, so the track stays unattached and the
                // user applies it later from 轨迹库.
                if (nav.pointInfo?.kind === 'journey') {
                  nav.patchCurrent({ trackId: track.id, dist: parsed.dist, ...(parsed.asc ? { asc: parsed.asc } : {}) });
                } else {
                  nav.showToast(t('journey.track.savedToLibrary'));
                }
                nav.closeAddRoute();
                nav.showToast(t(archiveTrimmed ? 'record.track.archiveTrimmed' : 'appShell.toastUploadTrack'));
              } finally {
                setTrackLoading(false);
              }
            } catch (e) {
              console.warn('[Upload] track import error:', e);
              setTrackLoading(false);
              nav.showToast(t(e instanceof TrackFileError ? e.messageKey : 'record.track.errParse'));
            }
          }}
        />
      )}
      {nav.plusPosterOpen && (
        <PlusPosterPage
          theme={theme}
          onClose={nav.closePlusPoster}
          onAsk={(prompt) => nav.openAssistant(prompt)}
          onOpenGear={() => { nav.closePlusPoster(); nav.openGearPage('items'); }}
          onOpenMembership={nav.openMembershipPage}
        />
      )}
      {nav.routeTopic && (
        <RouteTopicPage
          key={nav.routeTopic}
          theme={theme}
          topic={nav.routeTopic}
          onClose={nav.closeRouteTopic}
          onOpenRoute={(route) => nav.openPoint(route)}
          onCreateJourney={(route) => nav.openNewJourney(route)}
          onAsk={(prompt) => nav.openAssistant(prompt)}
        />
      )}
      {nav.routeRequestOpen && <RouteRequestSheet theme={theme} prefill={nav.routeRequestPrefill} onClose={nav.closeRouteRequest} onDone={nav.showToast} />}
      {nav.routeGuide && nav.routeGuide.entry !== 'chat' && (
        <RouteGuidePage key={nav.routeGuide.route.id} theme={theme} request={nav.routeGuide} onClose={nav.closeRouteGuide} />
      )}
      {nav.newJourneyOpen && (
        <NewJourneySheet
          key={`new-journey-${nav.newJourneyPreset?.id ?? 'blank'}`}
          theme={theme}
          preset={nav.newJourneyPreset}
          onClose={() => nav.closeNewJourney()}
          onToast={(m) => nav.showToast(m)}
          onCreate={async (poi) => {
            const saved = await nav.addJoinedJourney(poi);
            if (!saved) {
              nav.showToast(t('appShell.toastJourneyCreateFailed'));
              return false;
            }
            nav.closeNewJourney();
            nav.showToast(t('appShell.toastJourneyCreated'));
            nav.openPoint(saved);
            return true;
          }}
          onSmartPlan={async (poi, prompt) => {
            const saved = await nav.addJoinedJourney(poi);
            if (!saved) {
              nav.showToast(t('appShell.toastJourneyCreateFailed'));
              return false;
            }
            nav.closeNewJourney();
            nav.showToast(t('appShell.toastJourneyCreated'));
            const totalDays = saved.totalDays ?? poi.totalDays;
            const hasTrack = Boolean(poi.trackId || poi.trackFileUrl || (poi.trackCoords?.length ?? 0) > 1);
            nav.openAssistant(
              prompt,
              saved.id,
              true,
              totalDays != null && totalDays > 0
                ? t(hasTrack ? 'journeyEdit.form.smartPlanTrackRequest' : 'journeyEdit.form.smartPlanRequest', { name: saved.name, count: totalDays })
                : t(hasTrack ? 'journeyEdit.form.smartPlanTrackRequestUnset' : 'journeyEdit.form.smartPlanRequestUnset', { name: saved.name }),
            );
            return true;
          }}
        />
      )}
      {nav.journeyCodeEntryOpen && (
        <JourneyCodeEntrySheet
          theme={theme}
          onClose={() => nav.closeJourneyCodeEntry()}
          onJoined={async (journey) => {
            await data.refetchJourneys();
            nav.closeJourneyCodeEntry();
            nav.setMainTab('journey');
            nav.openPoint(journey);
            nav.showToast(t('qrLogin.journeyJoined', { name: journey.name }));
          }}
        />
      )}
      {nav.itineraryImportOpen && (
        <ItineraryImportPage
          theme={theme}
          onClose={() => nav.closeItineraryImport()}
          onCreated={async (journeyId) => {
            await data.refetchJourneys();
            const journey = await fetchJourneyPoiById(journeyId);
            nav.closeItineraryImport();
            nav.setMainTab('journey');
            nav.openPoint(journey);
            nav.showToast(t('itineraryImport.created'));
          }}
        />
      )}
      {nav.journeyInviteScannerOpen && (
        <QrLoginScannerPage
          theme={theme}
          journeyOnly
          onBack={() => nav.closeJourneyInviteScanner()}
          onApproved={() => {
            nav.closeJourneyInviteScanner();
            nav.showToast(t('qrLogin.approvedToast'));
          }}
          onJourneyInvite={async (invite) => {
            const result = await joinJourneyByCode(invite.code);
            if (!result.journeyId || (result.status !== 'joined' && result.status !== 'already_joined')) throw new Error(result.status);
            const journey = await fetchJourneyPoiById(result.journeyId);
            await data.refetchJourneys();
            nav.closeJourneyInviteScanner();
            nav.setMainTab('journey');
            nav.openPoint(journey);
            nav.showToast(t('qrLogin.journeyJoined', { name: journey.name }));
          }}
        />
      )}
      {nav.elevFull && <ElevationFull theme={theme} info={nav.elevFull.info} isMine={nav.elevFull.isMine} onClose={() => nav.closeElevation()} />}
      {nav.photoWall && <PhotoWall theme={theme} info={nav.photoWall.info} onClose={() => nav.closePhotoWall()} />}
      {nav.timelineAdd && <JourneyEntryEditor theme={theme} info={nav.timelineAdd.poi} initialDay={nav.timelineAdd.day} availableGroups={nav.timelineAdd.groups} editRow={nav.timelineAdd.editRow} onClose={() => nav.closeTimelineAdd()} />}
      {nav.editJourney && (
        <EditJourneySheet
          theme={theme}
          poi={nav.editJourney}
          onClose={() => nav.closeEditJourney()}
          onSave={(patch) => {
            nav.patchCurrent(patch);
            nav.closeEditJourney();
            nav.showToast(t('appShell.toastJourneyUpdated'));
          }}
        />
      )}
      {nav.journeySettings && (
        <JourneySettings
          theme={theme}
          poi={nav.merged(nav.journeySettings)}
          onClose={() => nav.closeJourneySettings()}
          onToast={(message) => nav.showToast(message)}
        />
      )}
      {nav.journeyHistory && (
        <JourneyVersionHistoryPage
          theme={theme}
          poi={nav.journeyHistory}
          onBack={() => nav.closeJourneyHistory()}
        />
      )}
      {nav.liveShare && (
        <HostShareSheet
          theme={theme}
          poi={nav.liveShare}
          onClose={() => nav.closeLiveShare()}
          onToast={(m) => nav.showToast(m)}
        />
      )}
      {nav.nearbyJoinOpen && (
        <NearbyJoinSheet
          theme={theme}
          onClose={() => nav.closeNearbyJoin()}
          onToast={(m) => nav.showToast(m)}
        />
      )}
      {directInvitePoi ? (
        <NJSharePanel
          theme={theme}
          tripName={directInvitePoi.name}
          journeyId={directInvitePoi.id}
          participantCount={directInvitePoi.companionList?.length || directInvitePoi.companions || 1}
          metrics={directInviteMetrics}
          onClose={() => nav.closeManageCompanions()}
          onToast={(m) => nav.showToast(m)}
          backgroundColor={theme.featureSurface}
        />
      ) : nav.manageCompanions ? (
        <ManageCompanions
          theme={theme}
          poi={managedPoi!}
          onClose={() => nav.closeManageCompanions()}
          onToast={(m) => nav.showToast(m)}
          onChange={(list) => nav.patchCurrent({ companionList: list, companions: list.length })}
          onPermissionsChange={(participantPermissions) => nav.patchCurrent({ participantPermissions })}
          onInviteEnabledChange={(inviteEnabled) => nav.patchCurrent({ inviteEnabled })}
          onLeave={async () => {
            try {
              await data.leaveJourney(managedPoi!.id);
              await data.refetchJourneys();
              nav.closeManageCompanions();
              nav.closePoint();
              nav.showToast(t('journey.manage.leaveSuccess'));
            } catch {
              nav.showToast(t('journey.manage.leaveFailed'));
            }
          }}
        />
      ) : null}
      {nav.sharePanel?.kind === 'journey' && (
        <JourneyShareSheet
          theme={theme}
          poi={nav.sharePanel}
          onClose={() => nav.closeSharePanel()}
          onToast={(m) => nav.showToast(m)}
          onCollaborate={() => {
            const sharedPoi = nav.sharePanel;
            nav.closeSharePanel();
            if (sharedPoi) nav.openManageCompanions(sharedPoi, 'invite');
          }}
          onPoster={() => {
            const sharedPoi = nav.sharePanel;
            nav.closeSharePanel();
            if (sharedPoi) setSharePosterPoi(sharedPoi);
          }}
          onPassphrase={() => {
            const sharedPoi = nav.sharePanel;
            nav.closeSharePanel();
            if (sharedPoi) setPassphrasePoi(sharedPoi);
          }}
        />
      )}
      {passphrasePoi && (
        <JourneyPassphraseSheet
          theme={theme}
          poi={passphrasePoi}
          onClose={() => setPassphrasePoi(null)}
          onToast={(message) => nav.showToast(message)}
        />
      )}
      {sharePosterPoi && (
        <SharePoster
          theme={theme}
          poi={sharePosterPoi}
          userId={userId}
          onClose={() => setSharePosterPoi(null)}
          onToast={(message) => nav.showToast(message)}
        />
      )}
      {nav.searchOpen && <SearchScreen theme={theme} onOpaqueChange={setSearchOpaque} />}
      <AppAssistant
        theme={theme}
        visible={nav.assistantOpen}
        initialPrompt={nav.assistantPrompt}
        initialDisplayPrompt={nav.assistantDisplayPrompt}
        autoSubmitInitialPrompt={nav.assistantAutoSubmit}
        startNewConversation={nav.assistantStartNewConversation}
        currentJourneyId={nav.assistantJourneyId}
        onClearPrompt={() => nav.clearAssistantPrompt()}
        onClose={() => nav.closeAssistant()}
        onOpenJourney={async (journeyId, focus) => {
          let journey = journeys.find((item) => item.id === journeyId);
          if (!journey) {
            const refreshedJourneys = await data.refetchJourneys();
            journey = refreshedJourneys.find((item) => item.id === journeyId);
          }
          if (!journey) {
            nav.showToast(t('agent.journeyUnavailable'));
            return;
          }
          setAssistantReturnJourneyId(journeyId);
          nav.closeAssistant();
          if (focus) nav.requestJourneyTab({ journeyId, ...focus });
          nav.openPoint(journey);
        }}
        onOpenRoute={(routeId) => {
          const route = data.routes.find((item) => item.id === routeId);
          if (!route) {
            nav.showToast(t('agent.routeUnavailable'));
            return;
          }
          nav.closeAssistant();
          nav.openPoint(route);
        }}
        onOpenGear={(target) => {
          nav.closeAssistant();
          if (target.itemId != null) nav.openGearItem(target.itemId);
          else if (target.setId) nav.openGearSet(target.setId);
          else nav.openGearPage(target.page);
        }}
      />
      <TrailLayer theme={theme} tabsVisible={!tabsHidden} />
      {nav.actionSheet && <ActionSheet theme={theme} config={nav.actionSheet} onClose={() => nav.closeActionSheet()} />}
      {nav.toast ? <Toast message={nav.toast.message} placement={nav.toast.placement} dark={theme.dark} /> : null}
    </View>
  );
}

function NavBridge({ signOut, deleteAccount }: { signOut: () => void; deleteAccount: () => Promise<void> }) {
  const data = useData();
  // DataContext keeps these functions stable, so the bridge object is too.
  const db = useMemo(() => ({
    updateJourney: data.updateJourney,
    updateRoute: data.updateRoute,
    deleteJourney: data.deleteJourney,
    toggleFav: data.toggleFav,
    toggleRouteFavorite: data.toggleRouteFavorite,
    createJourney: data.createJourney,
  }), [data.updateJourney, data.updateRoute, data.deleteJourney, data.toggleFav, data.toggleRouteFavorite, data.createJourney]);
  return (
    <NavProvider
      auth={{ signOut, deleteAccount }}
      db={db}
    >
      <MapPresentationProvider>
        <TrailProvider>
          <PushNavigator />
          <AppShell />
        </TrailProvider>
      </MapPresentationProvider>
    </NavProvider>
  );
}

// The signed-in session as it was last saved on this device. getSession()
// refreshes an expired access token first, and offline that refresh retries
// for half a minute before giving up, so launch reads storage directly and
// lets supabase-js catch up once the network is back.
async function readStoredSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(authStorageKey);
    const stored = raw ? JSON.parse(raw) as Session : null;
    return stored?.user?.id && stored.refresh_token && !stored.user.is_anonymous ? stored : null;
  } catch {
    return null;
  }
}

export function AppRoot() {
  const theme = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const stored = await readStoredSession();
      if (active && stored) setSession(stored);
      const { data, error } = await supabase.auth.getSession();
      // Offline: the refresh failed but supabase-js kept the session, and will
      // emit TOKEN_REFRESHED once it gets through. Stay signed in meanwhile.
      if (stored && error && isAuthRetryableFetchError(error)) return;
      let nextSession = data.session;
      if (nextSession?.user.is_anonymous) {
        const upgraded = await upgradeCurrentAnonymousSession();
        if (upgraded.error) {
          await supabase.auth.signOut();
          nextSession = null;
        } else {
          nextSession = upgraded.data.session;
        }
      }
      if (active) setSession(nextSession);
    };
    void initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // A failed offline refresh reports INITIAL_SESSION as null without
      // signing out; initialize() above decides the launch session.
      if (event === 'INITIAL_SESSION') return;
      if (!nextSession?.user.is_anonymous) setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) await clearOfflineCache();
  };

  const handleDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) throw error;
    await supabase.auth.signOut({ scope: 'local' });
    await clearOfflineCache();
  };

  const userId = session?.user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <PushBootstrap userId={userId} />
      {session === undefined ? null : session && userId ? (
        <DataProvider key={userId} userId={userId}>
          <MembershipProvider userId={userId}>
            <OnboardingGate theme={theme}>
              <NavBridge signOut={handleSignOut} deleteAccount={handleDeleteAccount} />
            </OnboardingGate>
          </MembershipProvider>
        </DataProvider>
      ) : (
        <AuthFlow theme={theme} onSuccess={() => {}} />
      )}
    </View>
  );
}
