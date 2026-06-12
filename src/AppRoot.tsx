// AppRoot.tsx — auth gate + app shell. Renders the active main screen, the
// floating tab bar, every nav-driven overlay, and the toast. Mirrors the
// prototype's InteractiveApp composition.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme/AppearanceContext';
import { NavProvider, useNav } from './nav/NavContext';
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
  const nav = useNav();

  let screen: React.ReactNode;
  if (nav.mainTab === 'gear') screen = <GearScreen theme={theme} />;
  else if (nav.mainTab === 'me') screen = <MeScreen theme={theme} />;
  else screen = <DiscoverScreen theme={theme} />;

  // The discover sheet (list or POI card) slides up over the tab bar — hide the
  // bar while it's open, matching the prototype (the sheet then reaches bottom).
  const sheetUp = nav.mainTab === 'discover' && (nav.sheetOpen || !!nav.pointInfo);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {screen}
      <BottomTabs theme={theme} hidden={sheetUp} />

      {nav.addRouteOpen && (
        <AddRouteSheet
          theme={theme}
          onClose={() => nav.closeAddRoute()}
          onUpload={() => {
            nav.closeAddRoute();
            nav.showToast('上传轨迹文件');
          }}
        />
      )}
      {nav.newJourneyOpen && (
        <NewJourneySheet
          theme={theme}
          onClose={() => nav.closeNewJourney()}
          onToast={(m) => nav.showToast(m)}
          onCreate={(poi) => {
            nav.addJoinedJourney(poi);
            nav.closeNewJourney();
            nav.showToast(poi.status === 'ongoing' ? '旅程已开始' : poi.status === 'completed' ? '回忆已记录' : '已加入计划');
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
            nav.showToast('旅程信息已更新');
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

export function AppRoot() {
  const theme = useTheme();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('kaipa_authed_v1').then((v) => setAuthed(v === '1')).catch(() => setAuthed(false));
  }, []);

  const signIn = () => {
    AsyncStorage.setItem('kaipa_authed_v1', '1').catch(() => {});
    setAuthed(true);
  };
  const signOut = () => {
    AsyncStorage.removeItem('kaipa_authed_v1').catch(() => {});
    setAuthed(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {authed === null ? null : authed ? (
        <NavProvider auth={{ signOut }}>
          <AppShell />
        </NavProvider>
      ) : (
        <AuthFlow theme={theme} onSuccess={signIn} />
      )}
    </View>
  );
}
