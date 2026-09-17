import React from 'react';
import { registerRootComponent } from 'expo';
import { AppearanceProvider } from '../../theme/AppearanceContext';
import { AdminMock } from './AdminMock';

function AdminPreview() {
  return <AppearanceProvider><AdminMock /></AppearanceProvider>;
}

registerRootComponent(AdminPreview);
