import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { useTheme } from './theme/AppearanceContext';
import { useI18n } from './i18n';
import { NavProvider, useNav } from './nav/NavContext';
import { DataProvider, useData } from './data/DataContext';
import { supabase } from './lib/supabase';
import { upgradeCurrentAnonymousSession } from './lib/auth';
import { buildTrackDraft, parseTrackFile, TrackFileError } from './lib/trackImport';
import { AuthFlow } from './screens/AuthFlow';
import { OnboardingGate } from './screens/OnboardingFlow';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { JourneyScreen } from './screens/JourneyScreen';
import { GearScreen } from './screens/GearScreen';
import { MeScreen } from './screens/MeScreen';
import { BottomTabs } from './components/BottomTabs';
import { ActionSheet } from './components/overlays/ActionSheet';
import { AddRouteSheet } from './components/overlays/AddRouteSheet';
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
import { JourneyVersionHistoryPage } from './components/journey/JourneyVersionHistoryPage';
import { SharePoster } from './components/overlays/SharePoster';
import { SearchScreen } from './screens/SearchScreen';
import { Toast } from './components/Toast';
import { AppAssistant } from './components/assistant/AppAssistant';
import { QrLoginScannerPage } from './components/auth/QrLoginScannerPage';
import { joinJourneyByInvite } from './lib/journeyInvite';

function AppShell() {
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
    if (!assistantReturnJourneyId || nav.pointInfo || nav.assistantOpen) return;
    const journeyId = assistantReturnJourneyId;
    setAssistantReturnJourneyId(undefined);
    nav.openAssistant(undefined, journeyId);
  }, [assistantReturnJourneyId, nav.assistantOpen, nav.pointInfo]);

  const detailOpen = !!nav.pointInfo;
  const sheetUp = detailOpen || (nav.mainTab === 'discover' && nav.sheetOpen);
  const hidden = { display: 'none' as const };
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
      <View
        pointerEvents={nav.mainTab === 'discover' || detailOpen ? 'auto' : 'none'}
        accessibilityElementsHidden={nav.mainTab !== 'discover' && !detailOpen}
        importantForAccessibility={nav.mainTab !== 'discover' && !detailOpen ? 'no-hide-descendants' : 'auto'}
        // iOS must never take this container out of the hierarchy: a MapView
        // that leaves and re-enters the window comes back with empty reused
        // annotation views (every route pin gone), and unmounting it reloads
        // the tiles, which reads as a flash. DiscoverScreen slides the map
        // off-screen instead, via keepMapWarm. Android keeps the old teardown.
        style={[
          StyleSheet.absoluteFill,
          Platform.OS === 'android' && !['discover', 'journey'].includes(nav.mainTab) && !detailOpen && hidden,
        ]}
      >
        <DiscoverScreen
          theme={theme}
          active={nav.mainTab === 'discover' || detailOpen}
          keepMapWarm={Platform.OS === 'ios'}
          covered={nav.searchOpen && searchOpaque}
          externalOverlayOpen={Boolean(sharePosterPoi || passphrasePoi)}
          onBlockingOverlayChange={setDiscoverOverlayOpen}
        />
      </View>
      <View style={[StyleSheet.absoluteFill, (nav.mainTab !== 'journey' || detailOpen) && hidden]}>
        <JourneyScreen theme={theme} />
      </View>
      <View style={[StyleSheet.absoluteFill, (nav.mainTab !== 'gear' || detailOpen) && hidden]}>
        <GearScreen theme={theme} />
      </View>
      <View
        pointerEvents={nav.mainTab === 'me' && !detailOpen ? 'auto' : 'none'}
        accessibilityElementsHidden={nav.mainTab !== 'me' || detailOpen}
        importantForAccessibility={nav.mainTab !== 'me' || detailOpen ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, { opacity: nav.mainTab === 'me' && !detailOpen ? 1 : 0 }]}
      >
        <MeScreen theme={theme} />
      </View>
      <BottomTabs
        theme={theme}
        hidden={sheetUp || discoverOverlayOpen || nav.tabBarHidden || nav.blockingOverlayOpen || !!sharePosterPoi || !!passphrasePoi}
        onOpenAssistant={() => nav.openAssistant()}
      />

      {nav.addRouteOpen && (
        <AddRouteSheet
          theme={theme}
          loading={trackLoading}
          onClose={() => { if (!trackLoading) nav.closeAddRoute(); }}
          onUpload={async () => {
            try {
              const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
              if (result.canceled || !result.result) return;
              setTrackLoading(true);
              try {
                const parsed = await parseTrackFile(result.result, t);
                const draft = await buildTrackDraft(parsed, { userId, sourceUri: result.result.uri, fileSize: result.result.size });
                const track = await data.createTrack(draft);
                if (!track) {
                  nav.showToast(t('record.track.errParse'));
                  return;
                }
                // Tracks belong to the library first. A journey can point at the
                // new row; a route cannot, so the track stays unattached and the
                // user applies it later from 轨迹库.
                if (nav.pointInfo?.kind === 'journey') {
                  nav.patchCurrent({ trackId: track.id, dist: parsed.dist, ...(parsed.asc ? { asc: parsed.asc } : {}) });
                } else {
                  nav.showToast(t('journey.track.savedToLibrary'));
                }
                nav.closeAddRoute();
                nav.showToast(t('appShell.toastUploadTrack'));
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
            const journey = await joinJourneyByInvite(invite);
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
        onOpenJourney={async (journeyId) => {
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
          nav.setSubTab('memory');
          nav.openPoint(journey);
        }}
        onOpenGear={(page) => {
          nav.closeAssistant();
          nav.openGearPage(page);
        }}
      />
      {nav.actionSheet && <ActionSheet theme={theme} config={nav.actionSheet} onClose={() => nav.closeActionSheet()} />}
      {nav.toast ? <Toast message={nav.toast.message} placement={nav.toast.placement} dark={theme.dark} /> : null}
    </View>
  );
}

function NavBridge({ signOut, deleteAccount }: { signOut: () => void; deleteAccount: () => Promise<void> }) {
  const data = useData();
  return (
    <NavProvider
      auth={{ signOut, deleteAccount }}
      db={{
        updateJourney: data.updateJourney,
        updateRoute: data.updateRoute,
        deleteJourney: data.deleteJourney,
        toggleFav: data.toggleFav,
        createJourney: data.createJourney,
      }}
    >
      <AppShell />
    </NavProvider>
  );
}

export function AppRoot() {
  const theme = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession?.user.is_anonymous) setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) throw error;
    await supabase.auth.signOut({ scope: 'local' });
  };

  const userId = session?.user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {session === undefined ? null : session && userId ? (
        <DataProvider userId={userId}>
          <OnboardingGate theme={theme}>
            <NavBridge signOut={handleSignOut} deleteAccount={handleDeleteAccount} />
          </OnboardingGate>
        </DataProvider>
      ) : (
        <AuthFlow theme={theme} onSuccess={() => {}} />
      )}
    </View>
  );
}
