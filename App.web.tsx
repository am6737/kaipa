import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from './src/i18n';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { AppRoot } from './src/AppRoot';
import { GuestApp } from './src/web/GuestApp';

function isGuestPath() {
  return /^\/j\//.test(window.location.pathname);
}

export default function App() {
  const guest = isGuestPath();

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { -webkit-tap-highlight-color: transparent !important; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AppearanceProvider>
            {guest ? <GuestApp /> : <AppRoot />}
          </AppearanceProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
