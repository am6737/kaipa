// TrailLayer.tsx — the 徒步导航 page when it is up, the pill back to it when
// it is minimised over a running recording.
import React from 'react';
import type { Theme } from '../../theme/theme';
import { useTrail } from '../../trail/TrailContext';
import { TrailMiniBar } from './TrailMiniBar';
import { TrailNavigationPage } from './TrailNavigationPage';

export function TrailLayer({ theme }: { theme: Theme }) {
  const { open } = useTrail();
  return open ? <TrailNavigationPage theme={theme} /> : <TrailMiniBar theme={theme} />;
}
