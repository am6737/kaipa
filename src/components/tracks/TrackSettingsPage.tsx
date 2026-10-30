// TrackSettingsPage.tsx — 一条自己的轨迹的设置，从详情页 ⋯ 菜单进入。
// 版式跟「旅程设置」一样，分区加卡片；每一项改完立刻生效，没有保存按钮。
//
//   * 名称：弹出重命名对话框。
//   * 发布：打开后所有人都能在搜索里找到。
//   * 主页可见范围：只对单独算一次出行的录制轨迹有意义（挂到旅程上的以旅程为准，
//     导入的文件不进时间线），其余情况不显示。
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import type { Theme } from '../../theme/theme';
import type { Track } from '../../data/tracks';
import type { Visibility } from '../../hooks/useSocial';
import { MeCard, MeRow, MeSection, SwitchRow } from '../me/parts';
import { MePushPage } from '../me/MePushPage';
import { useVisibilityPicker, visibilityLabel } from '../social/VisibilityPicker';
import { RenameTrackDialog } from './RenameTrackDialog';

export function TrackSettingsPage({ theme, track, onBack }: { theme: Theme; track: Track; onBack: () => void }) {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const [renameOpen, setRenameOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Registered after the detail page's, so Android back closes this first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const onJourney = useMemo(() => data.journeys.some((journey) => journey.trackId === track.id), [data.journeys, track.id]);
  const showVisibility = !track.fileFormat && !onJourney;

  const togglePublished = async (next: boolean) => {
    if (publishing) return;
    setPublishing(true);
    try {
      await data.setTrackPublished(track.id, next);
      nav.showToast(t(next ? 'tracks.publish.on' : 'tracks.publish.off'));
    } catch {
      nav.showToast(t('tracks.publish.failed'));
    } finally {
      setPublishing(false);
    }
  };

  const changeVisibility = (next: Visibility) => {
    void data.setTrackVisibility(track.id, next)
      .then(() => nav.showToast(t('profile.visibilitySaved')))
      .catch(() => nav.showToast(t('profile.actionFailed')));
  };

  const visibilityPicker = useVisibilityPicker(theme);

  return (
    <MePushPage theme={theme} title={t('tracks.settings.title')} onBack={onBack}>
      <MeSection theme={theme} title={t('tracks.settings.basicSection')} first>
        <MeCard theme={theme}>
          <MeRow
            theme={theme}
            label={t('tracks.settings.name')}
            detail={track.name || t('tracks.untitled')}
            detailMaxWidth="60%"
            onPress={() => setRenameOpen(true)}
          />
        </MeCard>
      </MeSection>

      <MeSection theme={theme} title={t('tracks.publish.section')}>
        <MeCard theme={theme}>
          <SwitchRow
            theme={theme}
            label={t('tracks.publish.label')}
            sub={t('tracks.publish.sub')}
            value={track.publishedAt != null}
            onChange={(next) => { void togglePublished(next); }}
          />
        </MeCard>
      </MeSection>

      {showVisibility ? (
        <MeSection theme={theme} title={t('profile.visibilityProfileSection')}>
          <MeCard theme={theme}>
            <MeRow
              theme={theme}
              label={t('profile.visibilityTitle')}
              detail={visibilityLabel(t, track.visibility ?? 'private')}
              onPress={(event) => visibilityPicker.open(event, track.visibility ?? 'private', changeVisibility)}
            />
          </MeCard>
        </MeSection>
      ) : null}

      {visibilityPicker.menu}

      <RenameTrackDialog
        theme={theme}
        visible={renameOpen}
        title={t('tracks.rename.title')}
        placeholder={t('tracks.rename.placeholder')}
        initialValue={track.name}
        confirmLabel={t('tracks.rename.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRenameOpen(false)}
        onConfirm={(name) => {
          setRenameOpen(false);
          void data.updateTrack(track.id, { name });
          nav.showToast(t('tracks.toast.renamed'));
        }}
      />
    </MePushPage>
  );
}
