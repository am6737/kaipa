// MarkDetail.tsx — one marked spot in a bottom sheet: its photo, its name, and
// where and when it was marked. The 徒步导航 page opens it from a mark or a
// route's named spot on the map, the track page from its list of marked
// spots; each passes the whole list, and a swipe goes through it in order.
//
// A sheet rather than a full page, whether there is a photo or not, so every
// spot opens the same way and the map stays in view above it. The photo sits
// at the top of the sheet; tapping it shows it whole. Rename and delete are
// secondary, so they live in the ⋯ menu, and only where the spots are the
// walker's own to change.
//
// A Modal rather than a nav page: the 徒步导航 page sits above the page stack.
// Its menu and dialogs are Modals too, so they stack over it on both platforms.
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, layout, motion, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { splitDistance } from '../../lib/trailGeo';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { GearAnchoredMenu, type MenuAnchor } from '../gear/AddGearMenu';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { RenameTrackDialog } from '../tracks/RenameTrackDialog';

export interface MarkDetailItem {
  key: string;
  name: string;
  photo?: string;
  /** Epoch ms or ISO time it was marked. */
  at?: number | string;
  /** Metres along the track. */
  alongM?: number;
  lng?: number;
  lat?: number;
  ele?: number | null;
  /** The line it lies on, when the map shows more than one. */
  source?: { name: string; color: string };
}

export function MarkDetail({
  theme,
  items,
  index,
  onClose,
  onRename,
  onDelete,
  onPageChange,
}: {
  theme: Theme;
  items: MarkDetailItem[];
  /** The one to open on; null keeps the page closed. */
  index: number | null;
  onClose: () => void;
  /** Absent where the marks can't be changed. */
  onRename?: (item: MarkDetailItem, name: string) => void;
  onDelete?: (item: MarkDetailItem) => void;
  /** A swipe settled on another mark, so a map or chart behind can follow. */
  onPageChange?: (page: number) => void;
}) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  // `page` is the settled page: the menu, rename and the copy check go by it.
  // The dots follow the finger through their own state, so a swipe moves them
  // without re-rendering the sheet.
  const [page, setPage] = useState(index ?? 0);
  const dots = useRef<PageDotsHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const visible = index != null && items.length > 0;
  const current = items[Math.min(page, items.length - 1)];
  const moreRef = useRef<View>(null);
  // Measured on press: the ⋯ button sits wherever the sheet put it. It is kept
  // while the menu fades out; a null anchor would send the closing menu to
  // the menu's fallback spot in the bottom-left corner.
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  // Open on the mark that was tapped.
  useEffect(() => {
    if (index == null) return;
    setPage(index);
    requestAnimationFrame(() => pager.current?.scrollTo({ x: index * width, animated: false }));
  }, [index, width]);
  // A deleted last mark leaves the page past the end; the last one or none is left.
  useEffect(() => {
    if (visible && page > items.length - 1) setPage(items.length - 1);
    if (index != null && !items.length) onClose();
  }, [index, items.length, onClose, page, visible]);
  // The copy check belongs to the coordinates it copied.
  useEffect(() => {
    setCopied(false);
  }, [page]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const editable = !!(onRename || onDelete);
  const photoHeight = Math.round(Math.min((width - space.xl * 2) * 0.75, height * 0.34));
  const openMenu = () => {
    if (!moreRef.current) return;
    moreRef.current.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ x, y, width: w, height: h });
      setMenuOpen(true);
    });
  };
  // iOS can't present a Modal while another is still dismissing: opening the
  // rename dialog the moment the ⋯ menu closes left an invisible, stuck page.
  // Wait out the menu's exit, as the gear editor does after the same menu.
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (menuTimer.current) clearTimeout(menuTimer.current);
  }, []);
  const afterMenu = (action: () => void) => {
    setMenuOpen(false);
    if (menuTimer.current) clearTimeout(menuTimer.current);
    menuTimer.current = setTimeout(action, 380);
  };
  const copyCoords = useCallback((text: string) => {
    void Clipboard.setStringAsync(text).then(() => setCopied(true));
  }, []);

  const extras = (
    <>
    <GearAnchoredMenu
      theme={theme}
      visible={menuOpen}
      anchor={menuAnchor}
      title={current?.name ?? ''}
      rows={[
        ...(onRename ? [{ key: 'rename', icon: 'edit' as const, label: t('trail.mark.rename'), onPress: () => afterMenu(() => setRenaming(true)) }] : []),
        ...(onDelete ? [{ key: 'delete', icon: 'trash' as const, label: t('trail.mark.delete'), onPress: () => afterMenu(() => setDeleting(true)) }] : []),
      ]}
      onClose={() => setMenuOpen(false)}
    />

    {current && onRename ? (
      <RenameTrackDialog
        theme={theme}
        visible={renaming}
        title={t('trail.mark.rename')}
        placeholder={t('trail.mark.renamePlaceholder')}
        initialValue={current.name}
        confirmLabel={t('tracks.rename.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRenaming(false)}
        onConfirm={(name) => {
          setRenaming(false);
          onRename(current, name);
        }}
      />
    ) : null}
    {current && onDelete ? (
      <AppActionDialog
        theme={theme}
        visible={deleting}
        title={t('trail.mark.deleteTitle', { name: current.name })}
        message={t('trail.mark.deleteMessage')}
        confirmLabel={t('trail.mark.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        confirmIcon="trash"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          onDelete(current);
        }}
      />
    ) : null}

    <PhotoViewer uri={viewing} closeLabel={t('common.close')} onClose={() => setViewing(null)} />
    </>
  );

  return (
    <MarkSheet theme={theme} visible={visible} onClose={onClose} closeLabel={t('common.close')}>
      <View style={{ height: layout.iconButton, marginTop: space.xs, marginHorizontal: layout.pagePadding - space.sm, flexDirection: 'row', alignItems: 'center' }}>
        {/* Centred on the sheet, clear of the buttons: it never grows past MAX_DOTS. */}
        {items.length > 1 ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <PageDots ref={dots} theme={theme} count={items.length} page={page} />
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {editable ? <View ref={moreRef} collapsable={false}><BareButton icon="more" color={theme.text} onPress={openMenu} label={t('trail.mark.more')} /></View> : null}
          <BareButton icon="close" color={theme.text} onPress={onClose} label={t('common.close')} />
        </View>
      </View>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Follows the finger: the dots move as soon as a swipe passes halfway,
        // not once the page has finished settling.
        scrollEventThrottle={16}
        onScroll={(event) => {
          dots.current?.setPage(Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width))));
        }}
        onMomentumScrollEnd={(event) => {
          const next = Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / width)));
          setPage((current) => (current === next ? current : next));
          onPageChange?.(next);
        }}
      >
        {items.map((item, i) => (
          <MarkPage
            key={item.key}
            theme={theme}
            item={item}
            width={width}
            photoHeight={photoHeight}
            viewLabel={t('trail.mark.viewPhoto')}
            copied={copied && i === page}
            onView={setViewing}
            onCopy={copyCoords}
          />
        ))}
      </ScrollView>

      {extras}
    </MarkSheet>
  );
}

/** One page of the pager. Memoised: a settled swipe re-renders the sheet, and
    with many spots redrawing every page held the dots and the finger up. */
const MarkPage = memo(function MarkPage({ theme, item, width, photoHeight, viewLabel, copied, onView, onCopy }: {
  theme: Theme;
  item: MarkDetailItem;
  width: number;
  photoHeight: number;
  viewLabel: string;
  copied: boolean;
  onView: (uri: string) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <View style={{ width, paddingHorizontal: space.xl, paddingTop: space.xs }}>
      {item.photo ? <Photo theme={theme} uri={item.photo} height={photoHeight} label={`${item.name} ${viewLabel}`} onView={onView} /> : null}
      <Facts theme={theme} item={item} copied={copied} onCopy={onCopy} />
    </View>
  );
});

/** One spot's facts: when, its name, the line it is on, how far along, how high, where. */
function Facts({ theme, item, copied, onCopy }: {
  theme: Theme;
  item: MarkDetailItem;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const { t } = useI18n();
  const along = splitDistance(item.alongM);
  const ele = item.ele != null && Number.isFinite(item.ele) ? Math.round(item.ele).toLocaleString('en-US') : null;
  const coords = item.lat != null && item.lng != null ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : null;
  return (
    <>
      {item.at != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs + 2 }}>
          <Icon name="clock" color={theme.text3} size={13} />
          <Text style={[type.meta, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{formatWhen(item.at, t)}</Text>
        </View>
      ) : null}
      <Text numberOfLines={2} style={[type.pageTitle, { lineHeight: 34, color: theme.text, marginTop: space.xxs }]}>{item.name}</Text>
      {item.source ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xxs }}>
          <View style={{ width: 14, height: 4, borderRadius: radius.pill, backgroundColor: item.source.color }} />
          <Text numberOfLines={1} style={[type.meta, { flexShrink: 1, color: theme.text2 }]}>{item.source.name}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Stat theme={theme} icon="distance" label={t('trail.mark.alongLabel')} value={item.alongM != null ? along.value : null} unit={along.unit} />
        <Stat theme={theme} icon="arrowUp" label={t('trail.mark.eleLabel')} value={ele} unit={t('trail.mark.eleUnit')} />
      </View>

      {coords ? (
        <View style={{ marginTop: space.sm, paddingLeft: space.md, paddingVertical: space.xxs, borderRadius: radius.card, backgroundColor: theme.fieldSurface, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[type.hint, { color: theme.text2 }]}>{t('trail.mark.coords')}</Text>
            <Text selectable style={{ fontFamily: MONO, fontSize: 14, fontWeight: '600', color: theme.text }}>{coords}</Text>
          </View>
          <Press
            onPress={() => onCopy(coords)}
            accessibilityRole="button"
            accessibilityLabel={copied ? t('trail.mark.copied') : t('trail.mark.copyCoords')}
            style={{ width: layout.iconButton, height: layout.iconButton, marginRight: space.xxs, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={copied ? 'check' : 'copy'} color={copied ? theme.accent : theme.text2} size={18} />
          </Press>
        </View>
      ) : null}
    </>
  );
}

/** A 44pt icon with no disc behind it; a drop shadow lifts it off light photos on iOS. */
function BareButton({ icon, color, onPress, label }: { icon: 'close' | 'more'; color: string; onPress: () => void; label: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: color === '#FFFFFF' ? 0.3 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }}
    >
      <Icon name={icon} color={color} size={24} strokeWidth={2.2} />
    </Press>
  );
}

/** The photo, rounded, above the facts; a tap shows it whole. */
function Photo({ theme, uri, height, label, onView }: { theme: Theme; uri: string; height: number; label: string; onView: (uri: string) => void }) {
  return (
    <Press
      onPress={() => onView(uri)}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      style={{ height, marginBottom: space.md, borderRadius: radius.card, overflow: 'hidden', backgroundColor: theme.fieldSurface }}
    >
      <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={160} />
    </Press>
  );
}

const MAX_DOTS = 11;
// Every dot sits in a slot of the same width, so the row's width and each
// dot's place are known exactly. The current one is the same dot, filled.
const DOT_SLOT = 11;

/** Where in the list the sheet is. A long list shows a window of MAX_DOTS that
    keeps the current one in the middle, its cut-off ends drawn smaller, so a
    spot opened anywhere in the list reads at a glance and the row stays short.
    When the window moves, the row slides by the slots it moved from where it
    was: with the current dot held in the middle, a swap in place would look still. */
type PageDotsHandle = { setPage: (page: number) => void };

const PageDots = forwardRef<PageDotsHandle, { theme: Theme; count: number; page: number }>(function PageDots({ theme, count, page: settled }, ref) {
  const [page, setPage] = useState(settled);
  useEffect(() => setPage(settled), [settled]);
  useImperativeHandle(ref, () => ({ setPage: (next) => setPage((current) => (current === next ? current : next)) }), []);
  const start = count <= MAX_DOTS ? 0 : Math.min(Math.max(page - Math.floor(MAX_DOTS / 2), 0), count - MAX_DOTS);
  const end = Math.min(count, start + MAX_DOTS);
  // One dot either side of the window is drawn under the clip, so a slide
  // brings a dot in rather than a gap.
  const from = Math.max(0, start - 1);
  const to = Math.min(count, end + 1);
  const shift = useRef(new Animated.Value(0)).current;
  const lastStart = useRef(start);
  useLayoutEffect(() => {
    const moved = start - lastStart.current;
    lastStart.current = start;
    // A jump (opening on a spot far along) just lands.
    if (!moved || Math.abs(moved) > 2) return;
    shift.stopAnimation();
    shift.setValue(moved * DOT_SLOT);
    Animated.timing(shift, { toValue: 0, duration: motion.standard, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [shift, start]);
  return (
    <View
      accessible
      accessibilityLabel={`${page + 1} / ${count}`}
      style={{ width: (end - start) * DOT_SLOT, height: space.xl + space.xs, overflow: 'hidden' }}
    >
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, left: -(start - from) * DOT_SLOT, flexDirection: 'row', alignItems: 'center', transform: [{ translateX: shift }] }}
      >
        {Array.from({ length: to - from }, (_, offset) => {
          const i = from + offset;
          const active = i === page;
          const cut = (i <= start && start > 0) || (i >= end - 1 && end < count);
          const size = cut ? 4 : 6;
          return (
            <View key={i} style={{ width: DOT_SLOT, alignItems: 'center' }}>
              <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: active ? theme.accent : theme.progressTrack }} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
});

function Stat({ theme, icon, label, value, unit }: { theme: Theme; icon: 'distance' | 'arrowUp'; label: string; value: string | null; unit: string }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        <Icon name={icon} color={theme.text2} size={14} />
        <Text style={[type.hint, { color: theme.text2 }]}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: space.xxs }}>
        <Text numberOfLines={1} style={[type.fieldValue, { color: value != null ? theme.text : theme.text3 }]}>{value ?? '--'}</Text>
        {value != null ? <Text style={[type.hint, { fontWeight: '600', color: theme.text2 }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** A bottom sheet over a dimmed backdrop, sliding as the 叠加轨迹 sheet does. */
function MarkSheet({ theme, visible, onClose, closeLabel, children }: {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: motion.emphasized, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(progress, { toValue: 0, duration: motion.quick, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [progress, visible]);
  if (!visible && !mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [Math.round(height * 0.6), 0] });
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.56)' : 'rgba(20,20,24,0.28)' }]}
        />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateY }],
          borderTopLeftRadius: radius.showcase,
          borderTopRightRadius: radius.showcase,
          backgroundColor: theme.featureSurface,
          paddingBottom: insets.bottom + space.lg,
        }}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

/** The photo whole, on black, until a tap anywhere closes it. */
function PhotoViewer({ uri, closeLabel, onClose }: { uri: string | null; closeLabel: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={uri != null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} style={{ flex: 1, backgroundColor: '#000000' }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" /> : null}
      </Press>
      <View style={{ position: 'absolute', top: insets.top + space.xs, left: layout.pagePadding - space.sm }}>
        <BareButton icon="close" color="#FFFFFF" onPress={onClose} label={closeLabel} />
      </View>
    </Modal>
  );
}

function formatWhen(at: number | string, t: ReturnType<typeof useI18n>['t']): string {
  const date = new Date(at);
  const day = t('trail.summary.dateFormat', { m: date.getMonth() + 1, d: date.getDate() });
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} ${time}`;
}
