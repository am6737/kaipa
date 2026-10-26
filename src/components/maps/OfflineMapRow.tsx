// OfflineMapRow.tsx — the AMap offline package for a route's city, offered on
// the route card while planning, not on the trail page at the trailhead.
import React from 'react';
import { Text, View } from 'react-native';
import { AppProgressBar, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useOfflineCity } from '../../lib/offlineMaps';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

// Android only: offers the AMap offline package for the route's city, or the
// SDK's own city list when the route has no region (a saved track).
export function OfflineMapRow({ theme, region }: { theme: Theme; region?: string }) {
  const { t } = useI18n();
  const { state, download, openManager } = useOfflineCity(region);
  if (state.status === 'unavailable') return null;
  if (!('city' in state)) {
    return (
      <Press onPress={openManager} accessibilityRole="button" style={offlineRowStyle()}>
        <Icon name="download" color={theme.text2} size={18} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.rowTitle, { color: theme.text }]}>{t('trail.offline.manage')}</Text>
          <Text style={[type.meta, { color: theme.text2 }]}>{t('trail.offline.hint')}</Text>
        </View>
        <Icon name="chevronR" color={theme.text3} size={16} />
      </Press>
    );
  }
  const city = state.city.cityName;
  const size = state.city.size > 0 ? `${Math.max(1, Math.round(state.city.size / 1048576))} MB` : null;
  const done = state.status === 'downloaded';
  const busy = state.status === 'downloading';
  const title = done
    ? t('trail.offline.downloaded', { city })
    : busy
      ? t('trail.offline.downloading', { city, progress: Math.round(state.progress) })
      : t('trail.offline.download', { city });
  return (
    <Press onPress={done || busy ? openManager : () => void download()} accessibilityRole="button" accessibilityState={{ busy }} style={offlineRowStyle()}>
      <Icon name={done ? 'check' : 'download'} color={done ? theme.accent : theme.text2} size={18} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.rowTitle, { color: theme.text }]}>{title}</Text>
        {busy ? (
          <View style={{ marginTop: space.xxs }}>
            <AppProgressBar theme={theme} value={state.progress} height={3} />
          </View>
        ) : (
          <Text numberOfLines={1} style={[type.meta, { color: state.status === 'failed' ? theme.danger : theme.text2 }]}>
            {state.status === 'failed' ? t('trail.offline.failed') : done ? t('trail.offline.manage') : [size, t('trail.offline.hint')].filter(Boolean).join('  ')}
          </Text>
        )}
      </View>
      {done || busy ? <Icon name="chevronR" color={theme.text3} size={16} /> : null}
    </Press>
  );
}

// An open row like the settings under it: no box, no rules.
function offlineRowStyle() {
  return {
    minHeight: 56,
    paddingVertical: space.xs,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  };
}

