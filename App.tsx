import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from './src/i18n';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { AppRoot } from './src/AppRoot';

function useWebTapReset() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { -webkit-tap-highlight-color: transparent !important; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
}

export default function App() {
  useWebTapReset();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <I18nProvider>
            <AppearanceProvider>
              <AppRoot />
            </AppearanceProvider>
          </I18nProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
