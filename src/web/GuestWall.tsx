import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { PhotoTile } from '../components/PhotoTile';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Press } from '../components/Press';
import { useI18n } from '../i18n';
import { paletteFor } from '../data/tones';
import { GuestLightbox } from './GuestLightbox';
import { GuestUploadSheet } from './GuestUploadSheet';
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

// ── Companions sheet ──
function CompanionsSheet({ theme, roster, counts, onClose, onPick }: {
  theme: Theme;
  roster: { name: string; ini: string; color?: string; tone?: string; isHost?: boolean; isSelf?: boolean }[];
  counts: Record<string, number>;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.sheetBackdrop} onPress={onClose} />
      <View style={s.sheetBottom}>
        <View style={[s.companionSheet, { backgroundColor: theme.dark ? '#1c1c1e' : theme.bg }]}>
          <View style={s.handle} />
          <Text style={[s.companionTitle, { color: theme.text }]}>{t('guest.wall.companionsTitle')}</Text>
          <Text style={[s.companionSub, { color: theme.text2 }]}>
            {t('guest.wall.companionsSub', { n: String(roster.length) })}
          </Text>

          <View style={[s.companionList, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: theme.hairline }]}>
            {roster.map((u, i) => {
              const n = counts[u.name] || 0;
              return (
                <React.Fragment key={i}>
                  <Press onPress={() => n > 0 && onPick(u.name)} style={[s.companionRow, n === 0 && { opacity: 0.55 }]}>
                    <Avatar ini={u.ini} color={u.color} tone={u.tone} size={42} />
                    <View style={{ flex: 1 }}>
                      <View style={s.companionNameRow}>
                        <Text style={[s.companionName, { color: theme.text }]}>{u.name}</Text>
                        {u.isHost && <View style={[s.badge, { backgroundColor: theme.accentSoft }]}><Text style={[s.badgeText, { color: theme.accent }]}>{t('guest.wall.hostBadge')}</Text></View>}
                        {u.isSelf && <View style={[s.badge, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}><Text style={[s.badgeText, { color: theme.text2 }]}>{t('guest.wall.youBadge')}</Text></View>}
                      </View>
                      <Text style={[s.companionCount, { color: theme.text2 }]}>
                        {n > 0 ? `${n} 个瞬间` : t('guest.wall.noMomentsYet')}
                      </Text>
                    </View>
                    {n > 0 && <Text style={{ color: theme.text3, fontSize: 15 }}>›</Text>}
                  </Press>
                  {i < roster.length - 1 && <View style={[s.separator, { backgroundColor: theme.hairline }]} />}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </View>
    </View>
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
  const [companionsOpen, setCompanionsOpen] = useState(false);

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

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    moments.forEach((p) => { m[p.guest_name] = (m[p.guest_name] || 0) + 1; });
    return m;
  }, [moments]);

  const visible = filter ? moments.filter((m) => m.guest_name === filter) : moments;
  const myCount = counts[identity.name] || 0;

  const avatarsForStack = roster.map((r) => ({ ini: r.ini, color: r.color, tone: r.tone }));

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
          /* hero cover + stats */
          <>
            <View style={{ height: 252 }}>
              {journey.coverUrl ? (
                <Image source={{ uri: journey.coverUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
              ) : (
                <PhotoTile tone={journey.tone} seed={journey.name + 'cover'} resWidth={1200} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.heroContent}>
                <Text style={s.heroTitle}>{journey.name}</Text>
                {(journey.date || journey.region) && (
                  <Text style={s.heroMeta}>{[journey.date, journey.region].filter(Boolean).join(' · ')}</Text>
                )}
              </View>
            </View>

            <View style={s.statsBar}>
              {wallItems.length > 0 && (
                <View style={s.statsTop}>
                  <Text style={[s.sectionTitle, { color: theme.text }]}>{t('guest.wall.title')}</Text>
                  <Text style={[s.statsCount, { color: theme.text2 }]}>
                    <Text style={{ fontFamily: 'monospace', fontWeight: '700', color: theme.text }}>{wallItems.length}</Text> 张
                  </Text>
                </View>
              )}

              <Press onPress={() => setCompanionsOpen(true)} style={s.companionBar}>
                <AvatarStack people={avatarsForStack} size={26} max={5} ringColor={theme.bg} />
                <Text style={[s.companionBarText, { color: theme.text2 }]}>
                  {t('guest.wall.companionCount', { n: String(roster.length) })} ›
                </Text>
                {myCount > 0 && (
                  <Press onPress={(e: any) => { e?.stopPropagation?.(); setFilter(identity.name); }} style={[s.myBadge, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[s.myBadgeText, { color: theme.accent }]}>我的 {myCount}</Text>
                  </Press>
                )}
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

      {/* FAB */}
      {!filter && (
        <Press onPress={() => setUploadOpen(true)} style={[s.fab, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
          <Text style={s.fabPlus}>＋</Text>
        </Press>
      )}

      {/* overlays */}
      {mediaPreview && (
        <View style={[StyleSheet.absoluteFill, s.mediaOverlay]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMediaPreview(null)} />
          <View style={s.mediaPreviewWrap}>
            <Image source={{ uri: mediaPreview }} contentFit="contain" style={StyleSheet.absoluteFill} />
          </View>
        </View>
      )}

      {lightbox && (
        <GuestLightbox
          theme={theme}
          moments={lightbox.list}
          index={lightbox.index}
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

      {companionsOpen && (
        <CompanionsSheet
          theme={theme}
          roster={roster}
          counts={counts}
          onClose={() => setCompanionsOpen(false)}
          onPick={(name) => { setCompanionsOpen(false); setFilter(name); }}
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
  heroContent: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.6,
    lineHeight: 31,
  },
  heroMeta: {
    fontFamily: 'monospace',
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
    letterSpacing: 0.3,
  },
  // stats
  statsBar: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  statsTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statsCount: {
    fontSize: 13,
    paddingBottom: 3,
  },
  companionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  companionBarText: {
    fontSize: 12.5,
  },
  myBadge: {
    marginLeft: 'auto',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  myBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
  mediaPreviewWrap: {
    width: '92%',
    aspectRatio: 1,
    maxHeight: '80%',
  },
  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    zIndex: 35,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPlus: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '300',
  },
  // companions sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  companionSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  companionTitle: {
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 4,
  },
  companionSub: {
    fontSize: 12.5,
    marginBottom: 14,
  },
  companionList: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
  },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  companionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  companionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  companionCount: {
    fontSize: 12,
    marginTop: 2,
  },
  separator: {
    height: 0.5,
    marginLeft: 68,
  },
});
