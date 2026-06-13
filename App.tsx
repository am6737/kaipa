// App.tsx — provider stack + root. Gesture root → SafeArea → i18n (language) →
// Appearance (theme) → Notifications. GestureHandlerRootView is required for
// react-native-gesture-handler to work (esp. on Android) — the discover card's
// drag-to-dismiss relies on it.
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from './src/i18n';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { NotifProvider } from './src/data/notifications';
import { AppRoot } from './src/AppRoot';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AppearanceProvider>
            <NotifProvider>
              <AppRoot />
            </NotifProvider>
          </AppearanceProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
