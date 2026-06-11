// App.tsx — provider stack + root. SafeArea → Appearance (theme) → Notifications.
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { NotifProvider } from './src/data/notifications';
import { AppRoot } from './src/AppRoot';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <NotifProvider>
          <AppRoot />
        </NotifProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
