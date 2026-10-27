// TrackDetailPage.tsx — one library track: its map, its profile, and the
// journeys it feeds.
//
// The body is TrackDetailContent, the same view a journey shows for its own
// track, so a track looks identical wherever it is opened. Elevation synthesis is
// off: a library row must show what its file contains, not a plausible curve.
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, AppIconButton, DetailPage, space, type } from '../../design-system';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useData } from '../../data/DataContext';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import { Theme } from '../../theme/theme';
import { Track } from '../../data/tracks';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';
import { exportTrack } from '../../lib/trackExport';
import { removeMedia } from '../../lib/storage';
import { MarkDetail, type MarkDetailItem } from '../trail/MarkDetail';
import { TrackDetailContent } from '../overlays/TrackDetailContent';
import { trackToPoi } from './trackToPoi';
import { PickDialog } from './PickDialog';
import { RenameTrackDialog } from './RenameTrackDialog';
import { trailRouteFromTrack, useOpenTrail } from '../../trail/trailRoutes';

// Distance and ascent are the two numbers worth reading before the map, so they
// sit in the same field tiles the gear detail pages use for their headline stats.
function StatTile({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 104, borderRadius: 24, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, paddingHorizontal: 20, paddingVertical: 17, justifyContent: 'space-between' }}>
      <Text numberOfLines={1} style={{ fontSize: 15, color: theme.text2, letterSpacing: -0.1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 25, lineHeight: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.7 }}>{value}</Text>
        {unit ? <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// The formatters return "12.34 km" / "+890 m" as one string; the tile wants the
// number large and the unit beside it.
function splitMeasure(text: string | null): { value: string; unit?: string } {
  if (!text) return { value: '—' };
  const cut = text.lastIndexOf(' ');
  return { value: text.slice(0, cut), unit: text.slice(cut + 1) };
}

export function TrackDetailPage({
  theme,
  track,
  onBack,
  entryVariant,
}: {
  theme: Theme;
  track: Track;
  onBack: () => void;
  entryVariant?: 'push' | 'continuationX' | 'continuationY';
}) {
  const { t } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const data = useData();

  const [renameOpen, setRenameOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openMark, setOpenMark] = useState<number | null>(null);

  const linkedJourneys = useMemo(() => data.journeys.filter((journey) => journey.trackId === track.id), [data.journeys, track.id]);
  const info = useMemo(() => trackToPoi(track), [track]);
  const followRoute = useMemo(() => trailRouteFromTrack(track), [track]);
  const openTrail = useOpenTrail();
  const hasElevation = (track.elevation?.length ?? 0) >= 2;
  const dist = splitMeasure(track.distM != null ? formatTrackDistance(track.distM) : null);
  const asc = splitMeasure(track.ascM != null ? formatTrackAscent(track.ascM) : null);

  // Spots marked with a photo on a recorded walk. Imported waypoints are names
  // only and stay in the profile's list below. The key is the waypoint's place
  // in the stored array, which rename and delete edit.
  const marks = useMemo<MarkDetailItem[]>(() => (track.waypoints ?? []).flatMap((waypoint, index) => (waypoint.photo ? [{
    key: String(index),
    name: waypoint.name,
    photo: waypoint.photo,
    at: waypoint.at,
    alongM: waypoint.km * 1000,
    lng: waypoint.lng,
    lat: waypoint.lat,
    ele: waypoint.ele,
  }] : [])), [track.waypoints]);
  const renameMark = (item: MarkDetailItem, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !track.waypoints) return;
    void data.updateTrack(track.id, { waypoints: track.waypoints.map((waypoint, index) => (String(index) === item.key ? { ...waypoint, name: trimmed } : waypoint)) }).then((ok) => {
      if (!ok) nav.showToast(t('trail.mark.editFailed'));
    });
  };
  const deleteMark = (item: MarkDetailItem) => {
    if (!track.waypoints) return;
    void data.updateTrack(track.id, { waypoints: track.waypoints.filter((_, index) => String(index) !== item.key) }).then((ok) => {
      // The photo goes only once nothing points at it any more.
      if (!ok) {
        nav.showToast(t('trail.mark.editFailed'));
        return;
      }
      nav.showToast(t('trail.mark.deleted'));
      if (item.photo && /^https?:/i.test(item.photo)) void removeMedia([item.photo]).catch(() => undefined);
    });
  };

  const exportGpx = () => {
    if (!(track.coords?.length || track.fileUrl)) return;
    void exportTrack(track).catch((error) => {
      if (error?.message !== 'User did not share') console.warn('[TrackDetailPage] export failed:', error);
    });
  };

  const applyTo = async (journeyId: string, journeyName: string) => {
    setApplyOpen(false);
    setBusy(true);
    // The journey's display strings are derived from the track's numbers, so the
    // card matches the file the moment the link is made.
    await data.updateJourney(journeyId, {
      trackId: track.id,
      ...(track.distM != null ? { dist: formatTrackDistance(track.distM) } : {}),
      ...(track.ascM != null ? { asc: formatTrackAscent(track.ascM) } : {}),
    });
    setBusy(false);
    nav.showToast(t('tracks.apply.done', { name: journeyName }));
  };

  const openMore = () => nav.openActionSheet({
    items: [
      ...(followRoute ? [{ label: t('trail.entry.followTrack'), icon: 'play' as const, onPress: () => openTrail(followRoute) }] : []),
      { label: t('tracks.action.rename'), icon: 'edit', onPress: () => setRenameOpen(true) },
      { label: t('tracks.action.apply'), icon: 'route', onPress: () => setApplyOpen(true) },
      { label: t('tracks.action.export'), icon: 'download', onPress: exportGpx },
      { label: t('tracks.action.delete'), icon: 'trash', destructive: true, onPress: () => setDeleteOpen(true) },
    ],
  });

  const confirmDelete = async () => {
    setBusy(true);
    await data.deleteTracks([track.id]);
    setBusy(false);
    setDeleteOpen(false);
    onBack();
  };

  return (
    <>
      <DetailPage
        theme={theme}
        entryVariant={entryVariant}
        onBack={onBack}
        backgroundColor={theme.groupedBg}
        flatChrome
        right={<AppIconButton theme={theme} name="more" onPress={openMore} noShadow accessibilityLabel={t('journey.section.more')} />}
      >
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: theme.text }}>
              {track.name || t('tracks.untitled')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, minWidth: 0 }}>
              {track.fileName ? (
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: MONO, fontSize: 12, color: theme.text3 }}>{track.fileName}</Text>
              ) : null}
              {track.pointCount ? (
                <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Icon name="pin" color={theme.text3} size={13} strokeWidth={1.8} />
                  <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text2 }}>
                    {t('tracks.meta.points', { count: track.pointCount })}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: 18 }}>
            <StatTile theme={theme} label={t('tracks.stat.distance')} value={dist.value} unit={dist.unit} />
            <StatTile theme={theme} label={t('tracks.stat.ascent')} value={asc.value} unit={asc.unit} />
          </View>

          {marks.length ? (
            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: theme.text2, marginBottom: 8 }}>
                {`${t('trail.mark.section')} ${marks.length}`}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ paddingHorizontal: 24, gap: space.sm }}>
                {marks.map((mark, index) => (
                  <Press key={mark.key} accessibilityRole="button" accessibilityLabel={mark.name} onPress={() => setOpenMark(index)} style={{ width: 96 }}>
                    <Image source={{ uri: mark.photo }} style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: theme.fieldSurface }} contentFit="cover" transition={120} />
                    <Text numberOfLines={1} style={[type.caption, { color: theme.text, marginTop: 6 }]}>{mark.name}</Text>
                  </Press>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: theme.text2, marginBottom: 8 }}>
              {t('tracks.detail.journeys')}
            </Text>
            {linkedJourneys.length ? linkedJourneys.map((journey) => (
              <Press
                key={journey.id}
                accessibilityRole="button"
                accessibilityLabel={journey.name}
                onPress={() => {
                  onBack();
                  nav.openPoint(journey);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}
              >
                <Icon name="route" color={theme.accent} size={17} strokeWidth={2} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: theme.text }}>{journey.name}</Text>
                <Icon name="chevronR" color={theme.text3} size={16} strokeWidth={2.2} />
              </Press>
            )) : (
              <Text style={[type.body, { color: theme.text3 }]}>{t('tracks.usage.unused')}</Text>
            )}
            {hasElevation ? null : (
              <Text style={[type.caption, { color: theme.text3, marginTop: 10 }]}>{t('tracks.detail.noElevation')}</Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: space.lg, paddingBottom: insets.bottom + 40 }}>
          <TrackDetailContent
            theme={theme}
            info={info}
            showActions={false}
            synthesizeElevation={false}
            bottomPadding={12}
          />
        </View>
      </DetailPage>

      <MarkDetail
        theme={theme}
        items={marks}
        index={openMark}
        onClose={() => setOpenMark(null)}
        onRename={renameMark}
        onDelete={deleteMark}
      />

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

      <PickDialog
        theme={theme}
        visible={applyOpen}
        title={t('tracks.apply.title')}
        emptyLabel={t('tracks.apply.empty')}
        cancelLabel={t('common.cancel')}
        options={data.journeys.map((journey) => ({
          item: journey,
          title: journey.name,
          subtitle: [journey.region, journey.date].filter(Boolean) as string[],
          selected: journey.trackId === track.id,
        }))}
        onCancel={() => setApplyOpen(false)}
        onSelect={(journey) => {
          if (journey.trackId === track.id) {
            setApplyOpen(false);
            nav.showToast(t('tracks.apply.alreadyThere', { name: journey.name }));
            return;
          }
          void applyTo(journey.id, journey.name);
        }}
      />

      <AppActionDialog
        theme={theme}
        visible={deleteOpen}
        title={t('tracks.detail.deleteTitle', { name: track.name })}
        message={t('tracks.detail.deleteMessage')}
        confirmLabel={t('tracks.action.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={busy}
        confirmIcon="trash"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
