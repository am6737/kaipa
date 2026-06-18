import React from 'react';
import { I18nProvider } from './src/i18n';
import { AppearanceProvider } from './src/theme/AppearanceContext';
import { GuestApp } from './src/web/GuestApp';

export default function App() {
  return (
    <I18nProvider>
      <AppearanceProvider>
        <GuestApp />
      </AppearanceProvider>
    </I18nProvider>
  );
}
