import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { SERIF } from '../theme/fonts';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar } from '../components/Avatar';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';
import { paletteFor } from '../data/tones';
import { GuestLightbox } from './GuestLightbox';
import { GuestUploadSheet } from './GuestUploadSheet';
import { GuestSaveSheet, type SavablePhoto } from './GuestSaveSheet';
import type { GuestMoment, JourneyData, CompanionData, HostData, InspoMedia } from './useGuestData';
import type { GuestIdentity } from './IdentitySheet';

interface Props {
  theme: Theme;
  journey: JourneyData;
  host: HostData;
  companions: CompanionData[];
  identity: GuestIdentity;
  moments: GuestMoment[];
  media: InspoMedia[];
  onAddMoment: (m: {
    guest_name: string;
    guest_ini: string;
    guest_tone: string;
    uri: string;
    caption: string;
    day: number;
    is_text: boolean;
  }) => Promise<void>;
  onDeleteMoment: (id: string) => Promise<void>;
  onToast: (msg: string) => void;
}

// ── action capsule icons ──
function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function DownloadIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v10M8.5 10.5L12 14l3.5-3.5M5 19h14" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Note card (text-only moment) ──
function NoteCard({ m, onPress, showWho, theme }: { m: GuestMoment; onPress: () => void; showWho: boolean; theme: Theme }) {
  const p = paletteFor(m.guest_tone);
  return (
    <Press onPress={onPress} style={s.cardWrap}>
      <View style={[s.noteCard, {
        backgroundColor: theme.dark ? `${p[0]}30` : `${p[0]}26`,
        borderColor: theme.hairline,
      }]}>
        <Text style={[s.noteText, { color: theme.text }]}>{m.caption || '记录了一刻'}</Text>
        <View style={s.noteMeta}>
          {showWho && <Avatar ini={m.guest_ini || m.guest_name.slice(0, 1)} tone={m.guest_tone} size={17} />}
          <Text style={[s.noteMetaText, { color: theme.text3 }]}>
            {showWho ? `${m.guest_name} · ` : ''}Day {m.day}
          </Text>
        </View>
      </View>
    </Press>
  );
}

// ── Photo card ──
function PhotoCard({ m, onPress, showWho, colW, theme }: { m: GuestMoment; onPress: () => void; showWho: boolean; colW: number; theme: Theme }) {
  if (m.is_text) return <NoteCard m={m} onPress={onPress} showWho={showWho} theme={theme} />;
  const ratio = 1;
  return (
    <Press onPress={onPress} style={s.cardWrap}>
      <View style={{ borderRadius: 12, overflow: 'hidden', width: colW, height: colW * ratio }}>
        {m.uri ? (
          <Image source={{ uri: m.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <PhotoTile tone={m.guest_tone} seed={m.id} style={StyleSheet.absoluteFill} />
        )}
        {showWho && (
          <View style={s.cardAuthor}>
            <Avatar ini={m.guest_ini || m.guest_name.slice(0, 1)} tone={m.guest_tone} size={18} />
            <Text style={s.cardAuthorName} numberOfLines={1}>{m.guest_name}</Text>
          </View>
        )}
      </View>
    </Press>
  );
}

// ── Media card (journey photos from app) ──
function mediaDisplayUri(m: InspoMedia): string | null {
  if (m.kind === 'video') return m.thumbnail || null;
  if (m.kind === 'livePhoto') return m.thumbnail || (/\.heic$/i.test(m.uri) ? null : m.uri);
  return m.uri || null;
}

function MediaCard({ m, onPress, colW }: { m: InspoMedia; onPress: () => void; colW: number }) {
  const displayUri = mediaDisplayUri(m);
  if (!displayUri) return null;
  return (
    <Press onPress={onPress} style={s.cardWrap}>
      <View style={{ borderRadius: 12, overflow: 'hidden', width: colW, height: colW }}>
        <Image source={{ uri: displayUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        {m.kind === 'video' && (
          <View style={s.videoBadge}>
            <Text style={s.videoBadgeText}>▶</Text>
          </View>
        )}
      </View>
    </Press>
  );
}

// ── Main wall ──
export function GuestWall({ theme, journey, host, companions, identity, moments, media, onAddMoment, onDeleteMoment, onToast }: Props) {
  const { t } = useI18n();
  const { width: W } = useWindowDimensions();
  const days = journey.total_days || parseInt(journey.days || '3', 10) || 3;

  const [filter, setFilter] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ list: GuestMoment[]; index: number } | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const colW = (Math.min(W, 500) - 32 - 7) / 2;

  const roster = useMemo(() => {
    const list = companions.map((c) => ({
      name: c.name,
      ini: c.ini,
      color: c.color,
      tone: c.tone || undefined,
      isHost: c.is_host,
      isSelf: false,
    }));
    list.push({
      name: identity.name,
      ini: identity.ini,
      color: undefined as any,
      tone: identity.tone,
      isHost: false,
      isSelf: true,
    });
    return list;
  }, [companions, identity]);

  const visible = filter ? moments.filter((m) => m.guest_name === filter) : moments;


  const canDelete = useCallback((m: GuestMoment) => m.guest_name === identity.name, [identity]);

  const handleAddPhotos = useCallback(async (photos: { uri: string; width: number; height: number }[], caption: string, day: number) => {
    setUploadOpen(false);
    for (let i = 0; i < photos.length; i++) {
      await onAddMoment({
        guest_name: identity.name,
        guest_ini: identity.ini,
        guest_tone: identity.tone,
        uri: photos[i].uri,
        caption: i === 0 ? caption : '',
        day,
        is_text: false,
      });
    }
    onToast(t('guest.wall.photoAdded', { count: String(photos.length) }));
  }, [identity, onAddMoment, onToast, t]);

  const handleAddText = useCallback(async (caption: string, day: number) => {
    setUploadOpen(false);
    await onAddMoment({
      guest_name: identity.name,
      guest_ini: identity.ini,
      guest_tone: identity.tone,
      uri: '',
      caption,
      day,
      is_text: true,
    });
    onToast(t('guest.wall.photoAdded', { count: '1' }));
  }, [identity, onAddMoment, onToast, t]);

  const handleDelete = useCallback(async (m: GuestMoment) => {
    setLightbox(null);
    await onDeleteMoment(m.id);
    onToast(t('guest.wall.deleted'));
  }, [onDeleteMoment, onToast, t]);

  const displayMedia = useMemo(() =>
    filter ? [] : media.filter((m) => !!mediaDisplayUri(m)),
  [media, filter]);

  // every saveable still image on the wall (journey media + photo moments)
  const savablePhotos = useMemo<SavablePhoto[]>(() => {
    const out: SavablePhoto[] = [];
    media.forEach((m) => {
      if (m.kind === 'video') return;
      const u = mediaDisplayUri(m);
      if (u) out.push({ id: m.id, uri: u });
    });
    moments.forEach((m) => {
      if (!m.is_text && m.uri) out.push({ id: m.id, uri: m.uri });
    });
    return out;
  }, [media, moments]);

  type WallItem = { kind: 'media'; data: InspoMedia } | { kind: 'moment'; data: GuestMoment };

  const wallItems: WallItem[] = useMemo(() => [
    ...displayMedia.map((m): WallItem => ({ kind: 'media', data: m })),
    ...visible.map((m): WallItem => ({ kind: 'moment', data: m })),
  ], [displayMedia, visible]);

  // masonry: distribute into 2 columns
  const [col1, col2] = useMemo(() => {
    const c1: WallItem[] = [];
    const c2: WallItem[] = [];
    let h1 = 0, h2 = 0;
    wallItems.forEach((item) => {
      const h = item.kind === 'moment' && item.data.is_text ? 100 : colW;
      if (h1 <= h2) { c1.push(item); h1 += h; }
      else { c2.push(item); h2 += h; }
    });
    return [c1, c2];
  }, [wallItems, colW]);

  const openLightbox = (idx: number) => setLightbox({ list: visible, index: idx });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {filter ? (
          /* filtered view header */
          <View style={[s.filterHeader, { paddingTop: 60 }]}>
            <Press onPress={() => setFilter(null)} style={[s.backBtn, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}>
              <Text style={{ color: theme.text2, fontSize: 16 }}>‹</Text>
            </Press>
            <Avatar ini={roster.find((r) => r.name === filter)?.ini || filter.slice(0, 1)} tone={roster.find((r) => r.name === filter)?.tone} size={38} />
            <View>
              <Text style={[s.filterTitle, { color: theme.text }]}>
                {filter === identity.name ? t('guest.wall.myMoments') : filter}
              </Text>
              <Text style={[s.filterSub, { color: theme.text2 }]}>{visible.length} 张</Text>
            </View>
          </View>
        ) : (
          /* hero — title + stats overlaid (aligned with PhotoWall) */
          <>
            <View style={{ aspectRatio: 1.05, overflow: 'hidden' }}>
              {journey.coverUrl ? (
                <Image source={{ uri: journey.coverUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
              ) : (
                <PhotoTile tone={journey.tone} seed={journey.name + 'cover'} resWidth={1200} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
                locations={[0.25, 0.6, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.heroOverlay}>
                <Text style={s.heroTitle} numberOfLines={2}>{journey.name}</Text>
                <View style={s.heroStats}>
                  <View style={s.heroStat}>
                    <Text style={s.heroStatV}>{String(wallItems.length)}</Text>
                    <Text style={s.heroStatL}>{t('journey.stat.moments')}</Text>
                  </View>
                  <View style={s.heroStat}>
                    <Text style={s.heroStatV}>{journey.date || '\u2014'}</Text>
                    {!!journey.region && <Text style={s.heroStatL}>{journey.region}</Text>}
                  </View>
                  <View style={s.heroStat}>
                    <Text style={s.heroStatV}>{String(roster.length)}</Text>
                    <Text style={s.heroStatL}>{t('journey.stat.people')}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* action capsule */}
            <View style={[s.actionCapsule, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : '#fff', borderColor: theme.hairline }]}>
              <Press onPress={() => setUploadOpen(true)} style={s.actionBtn}>
                <PlusIcon color={theme.text} />
                <Text style={[s.actionLabel, { color: theme.text }]}>{t('journey.action.add')}</Text>
              </Press>
              <View style={[s.actionDivider, { backgroundColor: theme.hairline }]} />
              <Press onPress={savablePhotos.length ? () => setSaveOpen(true) : undefined} style={s.actionBtn}>
                <DownloadIcon color={savablePhotos.length ? theme.text : theme.text3} />
                <Text style={[s.actionLabel, { color: savablePhotos.length ? theme.text : theme.text3 }]}>{t('journey.action.save')}</Text>
              </Press>
            </View>
          </>
        )}

        {/* masonry grid */}
        {wallItems.length > 0 && (
          <View style={s.masonryWrap}>
            <View style={s.masonry}>
              <View style={s.masonryCol}>
                {col1.map((item) => {
                  if (item.kind === 'media') {
                    const uri = mediaDisplayUri(item.data);
                    return <MediaCard key={item.data.id} m={item.data} onPress={() => uri && setMediaPreview(uri)} colW={colW} />;
                  }
                  const idx = visible.indexOf(item.data);
                  return <PhotoCard key={item.data.id} m={item.data} onPress={() => openLightbox(idx)} showWho={!filter} colW={colW} theme={theme} />;
                })}
              </View>
              <View style={s.masonryCol}>
                {col2.map((item) => {
                  if (item.kind === 'media') {
                    const uri = mediaDisplayUri(item.data);
                    return <MediaCard key={item.data.id} m={item.data} onPress={() => uri && setMediaPreview(uri)} colW={colW} />;
                  }
                  const idx = visible.indexOf(item.data);
                  return <PhotoCard key={item.data.id} m={item.data} onPress={() => openLightbox(idx)} showWho={!filter} colW={colW} theme={theme} />;
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* overlays */}
      {mediaPreview && (
        <Pressable style={[StyleSheet.absoluteFill, s.mediaOverlay]} onPress={() => setMediaPreview(null)}>
          <Image source={{ uri: mediaPreview }} contentFit="contain" style={s.mediaPreviewImg} />
        </Pressable>
      )}

      {lightbox && (
        <GuestLightbox
          theme={theme}
          moments={lightbox.list}
          index={lightbox.index}
          durationMs={journey.track_duration_ms ?? undefined}
          onIndexChange={(i) => setLightbox((prev) => prev ? { ...prev, index: i } : null)}
          onClose={() => setLightbox(null)}
          onDelete={handleDelete}
          canDelete={canDelete}
        />
      )}

      {uploadOpen && (
        <GuestUploadSheet
          theme={theme}
          days={days}
          onPost={handleAddPhotos}
          onPostText={handleAddText}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {saveOpen && (
        <GuestSaveSheet
          theme={theme}
          photos={savablePhotos}
          onClose={() => setSaveOpen(false)}
          onSaved={(n) => onToast(t('guest.wall.savedCount', { count: String(n) }))}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // filter header
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  filterSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  // hero
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '400',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 36,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatV: {
    fontSize: 18,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#fff',
    textAlign: 'center',
  },
  heroStatL: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  actionCapsule: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  // masonry
  masonryWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  masonry: {
    flexDirection: 'row',
    gap: 7,
  },
  masonryCol: {
    flex: 1,
    gap: 7,
  },
  cardWrap: {
  },
  // photo card
  cardAuthor: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  cardAuthorName: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#fff',
    maxWidth: 76,
  },
  videoBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 10,
    marginLeft: 1,
  },
  // note card
  noteCard: {
    borderRadius: 12,
    padding: 13,
    borderWidth: 0.5,
  },
  noteText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
  },
  noteMetaText: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  // media preview
  mediaOverlay: {
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewImg: {
    width: '100%',
    height: '100%',
  },
});
