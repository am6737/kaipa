// PublishedTrackPage.tsx — 从搜索打开的一条已发布轨迹。
// 自己的轨迹直接用本地那条，照常能改；别人的经 published_track RPC 读取，
// 交给 TrackDetailPage 的只读模式，并带上上传者。
import React, { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { DetailPage } from '../../design-system';
import type { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { fetchPublishedTrack, type PublishedTrackOwner } from '../../hooks/useSocial';
import { toTrack } from '../../lib/mappers';
import type { Track } from '../../data/tracks';
import { TrackDetailPage } from '../tracks/TrackDetailPage';
import { KPSpinner, KPState } from '../State';

export function PublishedTrackPage({ theme, trackId, onBack }: { theme: Theme; trackId: string; onBack: () => void }) {
  const { t } = useI18n();
  const data = useData();
  const mine = data.tracks.find((track) => track.id === trackId);
  const [loaded, setLoaded] = useState<{ track: Track; owner: PublishedTrackOwner } | null>(null);
  const [loading, setLoading] = useState(!mine);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    if (mine) return undefined;
    let alive = true;
    setLoading(true);
    fetchPublishedTrack(trackId)
      .then((row) => { if (alive) setLoaded(row ? { track: toTrack(row), owner: row.owner } : null); })
      .catch(() => { if (alive) setLoaded(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Only whether it is mine matters, not every edit to my copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, Boolean(mine)]);

  if (mine) return <TrackDetailPage theme={theme} track={mine} onBack={onBack} />;
  if (loaded) return <TrackDetailPage theme={theme} track={loaded.track} owner={loaded.owner} onBack={onBack} />;
  return (
    <DetailPage theme={theme} onBack={onBack} scrollable={false}>
      {loading ? (
        <View style={{ paddingTop: 120, alignItems: 'center' }}><KPSpinner theme={theme} /></View>
      ) : (
        <KPState theme={theme} icon="route" title={t('tracks.publish.unavailable')} style={{ paddingTop: 100 }} />
      )}
    </DetailPage>
  );
}
