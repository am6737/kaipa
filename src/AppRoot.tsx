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
import { ElevationFull } from './components/overlays/ElevationFull';
import { PhotoWall } from './components/overlays/PhotoWall';
import { JourneyCardFull } from './components/overlays/JourneyCardFull';
import { Toast } from './components/Toast';

function AppShell() {
  const theme = useTheme();
  const nav = useNav();

  let screen: React.ReactNode;
  if (nav.mainTab === 'gear') screen = <GearScreen theme={theme} />;
  else if (nav.mainTab === 'me') screen = <MeScreen theme={theme} />;
  else screen = <DiscoverScreen theme={theme} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {screen}
      <BottomTabs theme={theme} />

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
      {nav.detail && <JourneyCardFull theme={theme} poi={nav.detail} onClose={() => nav.closeDetail()} />}
      {nav.elevFull && <ElevationFull theme={theme} info={nav.elevFull.info} isMine={nav.elevFull.isMine} onClose={() => nav.closeElevation()} />}
      {nav.photoWall && <PhotoWall theme={theme} info={nav.photoWall.info} status={nav.photoWall.status} onClose={() => nav.closePhotoWall()} />}
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
