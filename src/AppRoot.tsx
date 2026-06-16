import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { File as FSFile } from 'expo-file-system';
import { parseTrack, computeStats, buildTrackData, snapWaypoints } from './lib/trackParser';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { useTheme } from './theme/AppearanceContext';
import { useI18n } from './i18n';
import { NavProvider, useNav } from './nav/NavContext';
import { DataProvider, useData } from './data/DataContext';
import { supabase } from './lib/supabase';
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
import { JourneyTimelineFull } from './components/overlays/JourneyTimeline';
import { JourneyCardFull } from './components/overlays/JourneyCardFull';
import { EditJourneySheet } from './components/overlays/EditJourneySheet';
import { JourneySettings } from './components/overlays/JourneySettings';
import { ManageCompanions } from './components/overlays/ManageCompanions';
import { Toast } from './components/Toast';

function AppShell() {
  const theme = useTheme();
  const { t } = useI18n();
  const nav = useNav();
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
              if (ext !== 'gpx' && ext !== 'kml') {
                nav.showToast(t('record.track.errFormat'));
                return;
              }
              setTrackLoading(true);
              try {
                const text = await result.result.text();
                const parsed = parseTrack(text, filename, t as any);
                if (parsed.error || !parsed.points) {
                  nav.showToast(parsed.error || t('record.track.errParse'));
                  return;
                }
                const stats = computeStats(parsed.points);
                if (!stats) {
                  nav.showToast(t('record.track.errParse'));
                  return;
                }
                const { trackCoords, trackElevation, trackDurationMs, dist, asc } = buildTrackData(stats);
                const trackWaypoints = parsed.waypoints ? snapWaypoints(parsed.waypoints, stats) : undefined;
                nav.patchCurrent({
                  trackCoords,
                  trackElevation,
                  trackDurationMs,
                  dist,
                  ...(asc ? { asc } : {}),
                  ...(trackWaypoints ? { trackWaypoints } : {}),
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
            nav.showToast(poi.status === 'ongoing' ? t('appShell.toastJourneyStarted') : poi.status === 'completed' ? t('appShell.toastMemoryLogged') : t('appShell.toastPlanJoined'));
            nav.openPoint(poi);
          }}
        />
      )}
      {nav.detail && <JourneyCardFull theme={theme} poi={nav.detail} onClose={() => nav.closeDetail()} />}
      {nav.elevFull && <ElevationFull theme={theme} info={nav.elevFull.info} isMine={nav.elevFull.isMine} onClose={() => nav.closeElevation()} />}
      {nav.photoWall && <PhotoWall theme={theme} info={nav.photoWall.info} status={nav.photoWall.status} onClose={() => nav.closePhotoWall()} />}
      {nav.timeline && <JourneyTimelineFull theme={theme} info={nav.timeline} onClose={() => nav.closeTimeline()} />}
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
      {nav.manageCompanions && (
        <ManageCompanions
          theme={theme}
          poi={nav.manageCompanions}
          onClose={() => nav.closeManageCompanions()}
          onToast={(m) => nav.showToast(m)}
          onChange={(list) => nav.patchCurrent({ companionList: list, companions: list.length })}
        />
      )}
      {nav.actionSheet && <ActionSheet theme={theme} config={nav.actionSheet} onClose={() => nav.closeActionSheet()} />}
      {nav.toast ? <Toast message={nav.toast} dark={theme.dark} /> : null}
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
