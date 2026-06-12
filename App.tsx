// App.tsx — provider stack + root. Gesture root → SafeArea → Appearance (theme) →
// Notifications. GestureHandlerRootView is required for react-native-gesture-handler
// to work (esp. on Android) — the discover card's drag-to-dismiss relies on it.
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { NotifProvider } from './src/data/notifications';
import { AppRoot } from './src/AppRoot';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <NotifProvider>
            <AppRoot />
          </NotifProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
