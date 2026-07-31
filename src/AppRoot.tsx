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
import { uploadMedia } from './lib/storage';
import { AuthFlow } from './screens/AuthFlow';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { GearScreen } from './screens/GearScreen';
import { MeScreen } from './screens/MeScreen';
import { BottomTabs } from './components/BottomTabs';
import { ActionSheet } from './components/overlays/ActionSheet';
import { AddRouteSheet } from './components/overlays/AddRouteSheet';
import { NewJourneySheet } from './components/overlays/NewJourneySheet';
import { ElevationFull } from './components/overlays/ElevationFull';
import { PhotoWall } from './components/overlays/PhotoWall';
import { JourneyEntryEditor } from './components/overlays/JourneyTimeline';
import { JourneyDetailSplit } from './components/overlays/JourneyDetailSplit';
import { EditJourneySheet } from './components/overlays/EditJourneySheet';
import { JourneySettings } from './components/overlays/JourneySettings';
import { HostShareSheet } from './components/overlays/HostShareSheet';
import { NearbyJoinSheet } from './components/overlays/NearbyJoinSheet';
import { ManageCompanions } from './components/overlays/ManageCompanions';
import { SharePoster } from './components/overlays/SharePoster';
import { SearchScreen } from './screens/SearchScreen';
import { Toast } from './components/Toast';

function AppShell() {
  const theme = useTheme();
  const { t } = useI18n();
  const nav = useNav();
  const { userId } = useData();
  const [trackLoading, setTrackLoading] = useState(false);

  const sheetUp = nav.mainTab === 'discover' && (nav.sheetOpen || !!nav.pointInfo);
  const hidden = { display: 'none' as const };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[StyleSheet.absoluteFill, nav.mainTab !== 'discover' && hidden]}>
        <DiscoverScreen theme={theme} />
      </View>
      <View style={[StyleSheet.absoluteFill, nav.mainTab !== 'gear' && hidden]}>
        <GearScreen theme={theme} />
      </View>
      <View style={[StyleSheet.absoluteFill, nav.mainTab !== 'me' && hidden]}>
        <MeScreen theme={theme} />
      </View>
      <BottomTabs theme={theme} hidden={sheetUp || nav.tabBarHidden} />

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
          onCreate={(poi) => {
            nav.addJoinedJourney(poi);
            nav.closeNewJourney();
            nav.showToast(t('appShell.toastJourneyCreated'));
            nav.openPoint(poi);
          }}
        />
      )}
      {nav.detail && <JourneyDetailSplit theme={theme} poi={nav.detail} onClose={() => nav.closeDetail()} />}
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
          poi={nav.journeySettings}
          onClose={() => nav.closeJourneySettings()}
          onToast={(m) => nav.showToast(m)}
          onEdit={() => nav.openEditJourney(nav.journeySettings!)}
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
      {nav.manageCompanions && (
        <ManageCompanions
          theme={theme}
          poi={nav.manageCompanions}
          onClose={() => nav.closeManageCompanions()}
          onToast={(m) => nav.showToast(m)}
          onChange={(list) => nav.patchCurrent({ companionList: list, companions: list.length })}
        />
      )}
      {nav.sharePanel && (
        <SharePoster
          theme={theme}
          poi={nav.sharePanel}
          onClose={() => nav.closeSharePanel()}
          onToast={(m) => nav.showToast(m)}
        />
      )}
      {nav.searchOpen && <SearchScreen theme={theme} />}
      {nav.actionSheet && <ActionSheet theme={theme} config={nav.actionSheet} onClose={() => nav.closeActionSheet()} />}
      {nav.toast ? <Toast message={nav.toast.message} placement={nav.toast.placement} dark={theme.dark} /> : null}
    </View>
  );
}

function NavBridge({ signOut }: { signOut: () => void }) {
  const data = useData();
  return (
    <NavProvider
      auth={{ signOut }}
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
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const userId = session?.user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {session === undefined ? null : session && userId ? (
        <DataProvider userId={userId}>
          <NavBridge signOut={handleSignOut} />
        </DataProvider>
      ) : (
        <AuthFlow theme={theme} onSuccess={() => {}} />
      )}
    </View>
  );
}
