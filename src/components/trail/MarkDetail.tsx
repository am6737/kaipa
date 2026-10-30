// MarkDetail.tsx — one marked spot shown as a card: its photo, its name, and
// where and when it was marked. The 徒步导航 page opens it from a mark or a
// route's named spot on the map, the track page from its list of marked spots,
// the route page from a waypoint dot or the 途经点 row; each passes the whole
// list, and a swipe goes through it in order.
//
// The card is the same everywhere: the photo on top wearing the number the map
// dot shows, the name, the mileage and the height there, then the coordinates.
// A spot with no photo wears no hero at all — the number and the controls sit in
// a plain row on the card's own surface. Pages start at the card's top edge and
// the card holds the tallest page, so a swipe never resizes it.
//
// Two presentations. `sheet` (the default) rises from the bottom of the screen,
// so the map stays in view above it — where a spot is looked at on the map.
// `card` floats the same card in the middle of a dimmed scrim, for a spot read
// from a list or a chart, where there is nothing behind worth keeping in view.
// Tapping the photo shows it whole. Rename and delete are secondary, so they
// live in the ⋯ menu, and only where the spots are the walker's own to change.
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
import { MONO } from '../../theme/fonts';
import { rgba, type Theme } from '../../theme/theme';
import { GearAnchoredMenu, type MenuAnchor } from '../gear/AddGearMenu';
import { Icon, type IconName } from '../Icon';
import { Press, PressDragGuardContext } from '../Press';
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
  /** The number the map circle and the waypoint row show. The page position
   *  plus one is used where the list has no number of its own. */
  number?: number;
  /** Worth pulling out of the list: the card wears a 亮点 tag. */
  highlight?: boolean;
}

/** The 亮点 tag's warm orange: no theme token covers it, and it matches the star
    that list rows already use for the same meaning. */
const HIGHLIGHT = '#FF9F0A';
const HIGHLIGHT_INK = '#C77700';
/** The glass disc is always light, so its icon is always ink, in both modes. */
const GLASS_INK = '#1C1C1E';
const GLASS_DISC = 36;

export function MarkDetail({
  theme,
  items,
  index,
  onClose,
  onRename,
  onDelete,
  onPageChange,
  presentation = 'sheet',
  onShowOnMap,
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
  /** `sheet` over the map, `card` on a dimmed scrim. */
  presentation?: 'sheet' | 'card';
  /** Absent where there is no map to bring forward. */
  onShowOnMap?: (item: MarkDetailItem, page: number) => void;
  /** @deprecated A spot with no photo shows no stand-in art, so the route's
   *  palette decides nothing here. Kept only so existing callers still typecheck. */
  tone?: string;
}) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const card = presentation === 'card';
  // The card floats inset from the screen edges; the sheet owns the full width.
  const pageWidth = card ? width - space.md * 2 : width;
  const heroHeight = Math.round(Math.min(230, pageWidth * 0.72, height * 0.3));
  const topRadius = card ? radius.feature : radius.showcase;
  const bodyPad = card ? space.lg : space.xl;
  const pager = useRef<ScrollView>(null);
  // `page` is the settled page: the menu, rename and the copy check go by it.
  // The dots follow the finger through their own state, so a swipe moves them
  // without re-rendering the card.
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
  // Measured on press: the ⋯ button sits wherever the card put it. It is kept
  // while the menu fades out; a null anchor would send the closing menu to
  // the menu's fallback spot in the bottom-left corner.
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  // Open on the mark that was tapped.
  useEffect(() => {
    if (index == null) return;
    setPage(index);
    requestAnimationFrame(() => pager.current?.scrollTo({ x: index * pageWidth, animated: false }));
  }, [index, pageWidth]);
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
  // A stable identity, so a settled swipe still leaves the other pages alone.
  const openMenu = useCallback(() => {
    if (!moreRef.current) return;
    moreRef.current.measureInWindow((x, y, w, h) => {
      setMenuAnchor({ x, y, width: w, height: h });
      setMenuOpen(true);
    });
  }, []);
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
    <MarkOverlay theme={theme} card={card} width={pageWidth} visible={visible} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={items.length > 1}
        // Follows the finger: the dots move as soon as a swipe passes halfway,
        // not once the page has finished settling.
        scrollEventThrottle={16}
        // Pages hang from the top edge, so a short page leaves the card's surface
        // under it rather than floating its content in the middle of the card.
        contentContainerStyle={{ alignItems: 'flex-start' }}
        onScroll={(event) => {
          dots.current?.setPage(Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / pageWidth))));
        }}
        onMomentumScrollEnd={(event) => {
          const next = Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
          setPage((current) => (current === next ? current : next));
          onPageChange?.(next);
        }}
      >
        {/* The photo is page-wide: see PressDragGuardContext. */}
        <PressDragGuardContext.Provider value>
          {items.map((item, i) => (
            <MarkPage
              key={item.key}
              theme={theme}
              item={item}
              number={item.number ?? i + 1}
              width={pageWidth}
              heroHeight={heroHeight}
              topRadius={topRadius}
              bodyPad={bodyPad}
              viewLabel={t('trail.mark.viewPhoto')}
              mapLabel={t('trail.mark.onMap')}
              moreLabel={t('trail.mark.more')}
              closeLabel={t('common.close')}
              copied={copied && i === page}
              current={i === page}
              pageIndex={i}
              editable={editable}
              onView={setViewing}
              onCopy={copyCoords}
              onClose={onClose}
              onMore={openMenu}
              moreRef={moreRef}
              onShowOnMap={onShowOnMap}
            />
          ))}
        </PressDragGuardContext.Provider>
      </ScrollView>

      {items.length > 1 ? (
        // Centred under the card: it never grows past MAX_DOTS.
        <View pointerEvents="none" style={{ paddingTop: card ? space.sm : 0, alignItems: 'center' }}>
          <PageDots ref={dots} theme={theme} count={items.length} page={page} />
        </View>
      ) : null}

      {extras}
    </MarkOverlay>
  );
}

/** One page of the pager: the photo with its number and controls (or, where the
    spot has no photo, a plain header row carrying the same things), then the
    facts. Memoised: the copy check and the settled page re-render the card, and
    with many spots redrawing every page held the dots and the finger up. */
const MarkPage = memo(function MarkPage({ theme, item, number, width, heroHeight, topRadius, bodyPad, viewLabel, mapLabel, moreLabel, closeLabel, copied, current, pageIndex, editable, onView, onCopy, onClose, onMore, moreRef, onShowOnMap }: {
  theme: Theme;
  item: MarkDetailItem;
  number: number;
  width: number;
  heroHeight: number;
  topRadius: number;
  bodyPad: number;
  viewLabel: string;
  mapLabel: string;
  moreLabel: string;
  closeLabel: string;
  copied: boolean;
  /** The settled page: it is the one whose ⋯ the menu anchors to. */
  current: boolean;
  pageIndex: number;
  editable: boolean;
  onView: (uri: string) => void;
  onCopy: (text: string) => void;
  onClose: () => void;
  onMore: () => void;
  moreRef: React.RefObject<View | null>;
  onShowOnMap?: (item: MarkDetailItem, page: number) => void;
}) {
  const photo = item.photo?.trim() ? item.photo : undefined;
  // The same three controls either way; over a photo they wear a light glass
  // disc, on the card's own surface they are bare ink icons.
  const glass = !!photo;
  const mapButton = onShowOnMap
    ? <ControlButton glass={glass} theme={theme} icon="map" onPress={() => onShowOnMap(item, pageIndex)} label={mapLabel} />
    : null;
  const moreButton = editable
    ? <View ref={current ? moreRef : undefined} collapsable={false}><ControlButton glass={glass} theme={theme} icon="more" onPress={onMore} label={moreLabel} /></View>
    : null;
  const closeButton = <ControlButton glass={glass} theme={theme} icon="close" onPress={onClose} label={closeLabel} />;
  return (
    <View style={{ width }}>
      {photo ? (
        <View style={{ height: heroHeight, borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius, overflow: 'hidden', backgroundColor: theme.fieldSurface }}>
          <Press onPress={() => onView(photo)} accessibilityRole="imagebutton" accessibilityLabel={`${item.name} ${viewLabel}`} style={StyleSheet.absoluteFill}>
            <Image source={{ uri: photo }} recyclingKey={photo} cachePolicy="memory-disk" style={{ flex: 1 }} contentFit="cover" transition={160} />
          </Press>
          {/* White over the photo, lifted by a soft shadow. */}
          <Text pointerEvents="none" style={[type.navTitle, { position: 'absolute', top: space.md, left: bodyPad, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }]}>#{number}</Text>
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, paddingTop: space.xs, paddingRight: space.xs, flexDirection: 'row' }}>
            {mapButton}
            {moreButton}
            {closeButton}
          </View>
        </View>
      ) : (
        // No photo, so no hero: the number and the same controls sit straight on
        // the card's surface, in the card's own ink.
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: bodyPad, paddingRight: space.xs, paddingTop: space.md }}>
          <Text style={[type.navTitle, { color: theme.text }]}>#{number}</Text>
          <View style={{ flex: 1 }} />
          {mapButton}
          {moreButton}
          {closeButton}
        </View>
      )}
      <Facts theme={theme} item={item} bodyPad={bodyPad} copied={copied} onCopy={onCopy} />
    </View>
  );
});

/** One spot's facts: its name, how far along, how high, whether it is worth
    the detour, when it was marked, the line it is on, and where. */
function Facts({ theme, item, bodyPad, copied, onCopy }: {
  theme: Theme;
  item: MarkDetailItem;
  bodyPad: number;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const { t } = useI18n();
  const km = item.alongM != null ? t('route.preview.waypointKm', { km: (item.alongM / 1000).toFixed(1) }) : null;
  const ele = item.ele != null && Number.isFinite(item.ele)
    ? `${t('trail.mark.eleLabel')} ${Math.round(item.ele).toLocaleString('en-US')} ${t('trail.mark.eleUnit')}`
    : null;
  const coords = item.lat != null && item.lng != null ? `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}` : null;
  return (
    <View style={{ paddingHorizontal: bodyPad, paddingTop: space.md }}>
      <Text numberOfLines={2} style={[type.pageTitle, { lineHeight: 34, color: theme.text }]}>{item.name}</Text>

      {km || ele || item.highlight ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, marginTop: space.xs }}>
          {km ? <Text style={[type.small, { color: theme.text2 }]}>{km}</Text> : null}
          {ele ? <Text numberOfLines={1} style={[type.small, { color: theme.text2 }]}>{ele}</Text> : null}
          {item.highlight ? <HighlightTag theme={theme} /> : null}
        </View>
      ) : null}

      {item.at != null || item.source ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.sm, rowGap: space.xxs, marginTop: space.xs }}>
          {item.at != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs + 2 }}>
              <Icon name="clock" color={theme.text3} size={13} />
              <Text style={[type.meta, { color: theme.text2, fontVariant: ['tabular-nums'] }]}>{formatWhen(item.at, t)}</Text>
            </View>
          ) : null}
          {item.source ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
              <View style={{ width: 14, height: 4, borderRadius: radius.pill, backgroundColor: item.source.color }} />
              <Text numberOfLines={1} style={[type.meta, { flexShrink: 1, color: theme.text2 }]}>{item.source.name}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {coords ? (
        <View style={{ marginTop: space.md, paddingLeft: space.md, paddingVertical: space.xxs, borderRadius: radius.card, backgroundColor: theme.fieldSurface, flexDirection: 'row', alignItems: 'center' }}>
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
    </View>
  );
}

/** The spot is worth the detour: a star in a warm tint, so it reads at a glance. */
function HighlightTag({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, height: 24, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: rgba(HIGHLIGHT, theme.dark ? 0.22 : 0.14) }}>
      <Icon name="starFill" color={theme.dark ? HIGHLIGHT : HIGHLIGHT_INK} size={12} />
      <Text style={[type.micro, { fontWeight: '700', color: theme.dark ? HIGHLIGHT : HIGHLIGHT_INK }]}>{t('trail.mark.highlight')}</Text>
    </View>
  );
}

/** A card control: over a photo it is a light glass disc, on the card's own
    surface a bare icon in the card's ink. Both are 44pt, so both are easy to hit. */
function ControlButton({ glass, theme, icon, onPress, label }: { glass: boolean; theme: Theme; icon: IconName; onPress: () => void; label: string }) {
  if (glass) {
    return (
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Translucent white glass sits over the photo, in both appearance modes. */}
        <View style={{ width: GLASS_DISC, height: GLASS_DISC, borderRadius: GLASS_DISC / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)', boxShadow: '0px 2px 8px rgba(0,0,0,0.18)' }}>
          <Icon name={icon} color={GLASS_INK} size={18} strokeWidth={2.2} />
        </View>
      </Press>
    );
  }
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} color={theme.text} size={22} strokeWidth={2.2} />
    </Press>
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

const MAX_DOTS = 11;
// Every dot sits in a slot of the same width, so the row's width and each
// dot's place are known exactly. The current one is a pill in its slot.
const DOT_SLOT = 20;
const DOT_PILL = 14;

/** Where in the list the card is. A long list shows a window of MAX_DOTS that
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
              <View style={{ width: active ? DOT_PILL : size, height: 6, borderRadius: radius.pill, backgroundColor: active ? theme.accent : theme.progressTrack }} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
});

/** The card: a bottom sheet over a dimmed backdrop, sliding as the 叠加轨迹 sheet
    does, or the same card held in the middle of the screen on a deeper scrim. */
function MarkOverlay({ theme, card, width, visible, onClose, closeLabel, children }: {
  theme: Theme;
  card: boolean;
  width: number;
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
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          // The card floats off the page behind it, so its scrim dims deeper
          // than the sheet's, and does the same in either appearance mode.
          style={[StyleSheet.absoluteFill, { backgroundColor: card ? 'rgba(0,0,0,0.45)' : theme.dark ? 'rgba(0,0,0,0.56)' : 'rgba(20,20,24,0.28)' }]}
        />
      </Animated.View>
      {card ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: progress,
            transform: [{ scale }],
          }}
        >
          <View style={{ width, borderRadius: radius.feature, backgroundColor: theme.featureSurface, overflow: 'hidden', paddingBottom: space.md }}>
            {children}
          </View>
        </Animated.View>
      ) : (
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
      )}
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
        {/* White over the photo the viewer shows on black. */}
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
