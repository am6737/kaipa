// TrailLayer.tsx — the 徒步导航 page when it is up, the pill back to it when
// it is minimised over a running recording. While the tab bar shows, its 记录
// tab carries the clock and leads back instead, so the pill stays away.
import React from 'react';
import type { Theme } from '../../theme/theme';
import { useTrail } from '../../trail/TrailContext';
import { TrailMiniBar } from './TrailMiniBar';
import { TrailNavigationPage } from './TrailNavigationPage';

export function TrailLayer({ theme, tabsVisible }: { theme: Theme; tabsVisible: boolean }) {
  const { open } = useTrail();
  return open ? <TrailNavigationPage theme={theme} /> : <TrailMiniBar theme={theme} hidden={tabsVisible} />;
}
