import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { parseTrack, computeStats, buildTrackData, snapWaypoints } from './lib/trackParser';
import { extractKmlFromKmz } from './lib/kmz';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { useTheme } from './theme/AppearanceContext';
import { useI18n } from './i18n';
import { NavProvider, useNav } from './nav/NavContext';
import { DataProvider, useData } from './data/DataContext';
import { supabase } from './lib/supabase';
import { upgradeCurrentAnonymousSession } from './lib/auth';
import { uploadMedia } from './lib/storage';
import { AuthFlow } from './screens/AuthFlow';
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
  const [assistantReturnJourneyId, setAssistantReturnJourneyId] = useState<string>();
  const [discoverOverlayOpen, setDiscoverOverlayOpen] = useState(false);

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
        accessibilityElementsHidden={nav.mainTab === 'journey' && !detailOpen}
        importantForAccessibility={nav.mainTab === 'journey' && !detailOpen ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, !['discover', 'journey'].includes(nav.mainTab) && !detailOpen && hidden]}
      >
        <DiscoverScreen
          theme={theme}
          active={nav.mainTab === 'discover' || detailOpen}
          keepMapWarm={nav.mainTab === 'journey' && !detailOpen}
          externalOverlayOpen={Boolean(sharePosterPoi)}
          onBlockingOverlayChange={setDiscoverOverlayOpen}
        />
      </View>
      <View style={[StyleSheet.absoluteFill, (nav.mainTab !== 'journey' || detailOpen) && hidden]}>
        <JourneyScreen theme={theme} />
      </View>
      <View style={[StyleSheet.absoluteFill, (nav.mainTab !== 'gear' || detailOpen) && hidden]}>
        <GearScreen theme={theme} />
      </View>
      <View style={[StyleSheet.absoluteFill, (nav.mainTab !== 'me' || detailOpen) && hidden]}>
        <MeScreen theme={theme} />
      </View>
      <BottomTabs
        theme={theme}
        hidden={sheetUp || discoverOverlayOpen || nav.tabBarHidden || nav.blockingOverlayOpen || !!sharePosterPoi}
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
              const filename = result.result.name || '';
              const ext = (filename.split('.').pop() || '').toLowerCase();
              if (ext !== 'gpx' && ext !== 'kml' && ext !== 'kmz') {
                nav.showToast(t('record.track.errFormat'));
                return;
              }
              setTrackLoading(true);
              try {
                let text: string;
                let parseFilename = filename;
                if (ext === 'kmz') {
                  const buffer = await result.result.arrayBuffer();
                  const kml = extractKmlFromKmz(new Uint8Array(buffer));
                  if (!kml) {
                    nav.showToast(t('record.track.errParse'));
                    return;
                  }
                  text = kml;
                  parseFilename = filename.replace(/\.kmz$/i, '.kml');
                } else {
                  text = await result.result.text();
                }
                const parsed = parseTrack(text, parseFilename, t as any);
                if (parsed.error || !parsed.points) {
                  nav.showToast(parsed.error || t('record.track.errParse'));
                  return;
                }
                const stats = computeStats(parsed.points);
                if (!stats) {
                  nav.showToast(t('record.track.errParse'));
                  return;
                }
                const trackFileUrl = await uploadMedia(result.result.uri, userId, nav.pointInfo?.id || 'route-import');
                const { trackCoords, trackElevation, trackDurationMs, dist, asc } = buildTrackData(stats);
                const trackWaypoints = parsed.waypoints ? snapWaypoints(parsed.waypoints, stats) : undefined;
                nav.patchCurrent({
                  trackCoords,
                  trackElevation,
                  trackDurationMs,
                  dist,
                  ...(asc ? { asc } : {}),
                  ...(trackWaypoints ? { trackWaypoints } : {}),
                  trackFileUrl,
                  trackFileName: filename,
                });
                nav.closeAddRoute();
                nav.showToast(t('appShell.toastUploadTrack'));
              } finally {
                setTrackLoading(false);
              }
            } catch (e) {
              console.warn('[Upload] track parse error:', e);
              setTrackLoading(false);
              nav.showToast(t('record.track.errParse'));
            }
          }}
        />
      )}
      {nav.newJourneyOpen && (
        <NewJourneySheet
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
            nav.openAssistant(
              prompt,
              saved.id,
              true,
              t(poi.trackFileUrl || (poi.trackCoords?.length ?? 0) > 1
                ? 'journeyEdit.form.smartPlanTrackRequest'
                : 'journeyEdit.form.smartPlanRequest', {
                name: saved.name,
                count: saved.totalDays || poi.totalDays || 1,
              }),
            );
            return true;
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
        />
      ) : null}
      {nav.sharePanel && (
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
      {nav.searchOpen && <SearchScreen theme={theme} />}
      <AppAssistant
        theme={theme}
        visible={nav.assistantOpen}
        initialPrompt={nav.assistantPrompt}
        initialDisplayPrompt={nav.assistantDisplayPrompt}
        autoSubmitInitialPrompt={nav.assistantAutoSubmit}
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
          <NavBridge signOut={handleSignOut} deleteAccount={handleDeleteAccount} />
        </DataProvider>
      ) : (
        <AuthFlow theme={theme} onSuccess={() => {}} />
      )}
    </View>
  );
}
