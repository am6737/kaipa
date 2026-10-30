import React from 'react';
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { Track } from '../../data/tracks';
import { layout, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from './NewJourneyParts';

// Picker sheets in the create flow stay at about half the screen; longer lists scroll inside.
export const NJ_PICKER_HEIGHT_RATIO = 0.55;

// Route data stores ascent as "+1735 m"; lists show it the way the rest of the app does.
export function ascentLabel(asc?: string) {
  const value = asc?.replace('+', '').trim();
  return value ? `↑${value}` : '';
}

export function trackMeta(track: Pick<Track, 'distM' | 'ascM'>) {
  const distance =
    track.distM == null ? '--' : `${(track.distM / 1000).toFixed(1)} km`;
  const ascent = track.ascM == null ? '--' : `↑${Math.round(track.ascM)} m`;
  return `${distance}  ${ascent}`;
}

export function NJShortcutRow({
  theme,
  name,
  meta,
  icon,
  busy = false,
  disabled = false,
  onPress,
}: {
  theme: Theme;
  name: string;
  meta?: string;
  icon?: 'route';
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingVertical: space.sm,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.control,
            backgroundColor: theme.fieldSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {busy ? (
            <ActivityIndicator color={theme.text2} />
          ) : (
            <Icon name={icon} color={theme.text2} size={17} />
          )}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>
          {name}
        </Text>
        {meta ? (
          <Text
            numberOfLines={1}
            style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      {busy && !icon ? <ActivityIndicator color={theme.text2} /> : null}
    </Press>
  );
}

export function NJTrackRow({
  theme,
  attachedTrack,
  catalogTrack,
  busy,
  disabled,
  onOpen,
  onRemove,
}: {
  theme: Theme;
  attachedTrack: { name: string; meta: string } | null;
  catalogTrack: boolean;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const name =
    attachedTrack?.name ||
    (catalogTrack
      ? t('journeyEdit.form.trackWithRoute')
      : t('journeyEdit.form.chooseTrack'));
  // The route card above already shows the distance, so a route's own track needs no meta line.
  const meta =
    attachedTrack?.meta ||
    (catalogTrack ? undefined : t('journeyEdit.form.trackUploadAlternative'));
  return (
    <View>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}
      >
        <Text style={[type.pageTitle, { color: theme.text }]}>
          {t('journeyEdit.form.trackLabel')}
        </Text>
        {!attachedTrack && !catalogTrack ? (
          <Text style={[type.caption, { color: theme.text3 }]}>
            {t('journeyEdit.form.trackOptional')}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          marginTop: space.xs,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <NJShortcutRow
            theme={theme}
            name={name}
            meta={meta}
            busy={busy}
            disabled={disabled || Boolean(attachedTrack)}
            onPress={onOpen}
          />
        </View>
        {attachedTrack ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel={t('journeyEdit.form.removeTrack')}
            disabled={busy || disabled}
            onPress={onRemove}
            style={{
              width: layout.iconButton,
              height: layout.iconButton,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="close" color={theme.text2} size={16} />
          </Press>
        ) : (
          <Press
            accessibilityRole="button"
            disabled={busy || disabled}
            onPress={onOpen}
            style={{
              minWidth: layout.iconButton,
              minHeight: layout.iconButton,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {catalogTrack ? (
              <Text style={[type.labelStrong, { color: theme.accent }]}>
                {t('journeyEdit.form.replaceTrack')}
              </Text>
            ) : (
              <Icon name="chevronR" color={theme.text3} size={15} />
            )}
          </Press>
        )}
      </View>
    </View>
  );
}

export function NewJourneyTrackChooser({
  theme,
  tracks,
  busy,
  onClose,
  onSelect,
  onUpload,
}: {
  theme: Theme;
  tracks: Track[];
  busy: boolean;
  onClose: () => void;
  onSelect: (track: Track) => void;
  onUpload: () => void;
}) {
  const { t } = useI18n();
  const { height: windowHeight } = useWindowDimensions();
  return (
    <NJBottomSheet theme={theme} onClose={onClose} bodyScrolls borderless>
      <ScrollView
        style={{ maxHeight: windowHeight * NJ_PICKER_HEIGHT_RATIO }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: space.xl,
        }}
      >
        <Text
          style={[
            type.pageTitle,
            { color: theme.text, marginBottom: space.sm },
          ]}
        >
          {t('journeyEdit.form.trackChooserTitle')}
        </Text>
        {tracks.map((track) => (
          <NJShortcutRow
            key={track.id}
            theme={theme}
            name={
              track.name ||
              track.fileName ||
              t('journey.settings.locationUnnamed')
            }
            meta={trackMeta(track)}
            disabled={busy}
            onPress={() => onSelect(track)}
          />
        ))}
        <NJShortcutRow
          theme={theme}
          name={t('journeyEdit.form.uploadTrackFile')}
          meta={t('journeyEdit.form.trackFormats')}
          busy={busy}
          onPress={onUpload}
        />
      </ScrollView>
    </NJBottomSheet>
  );
}
