import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Animated, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Heart } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { guideText } from '../../data/routeGuides';
import type { RouteCondition } from '../../data/routeConditions';
import type { Theme } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { markRouteConditionHelpful } from '../../hooks/useRouteConditions';

export function RouteConditionCard({ theme, report, compact = false, onPress }: { theme: Theme; report: RouteCondition; compact?: boolean; onPress?: () => void }) {
  const { resolved } = useI18n();
  const [width, setWidth] = useState(0);
  const [helpful, setHelpful] = useState(false);
  const [helpfulCount, setHelpfulCount] = useState(report.helpful ?? 0);
  if (compact) {
    const preview = <View style={styles.preview}>
      <View style={styles.previewText}>
        {guideText(report.body, resolved).trim() ? <Text numberOfLines={2} style={[styles.previewBody, { color: theme.text }]}>{guideText(report.body, resolved)}</Text> : null}
        <Text numberOfLines={1} style={[styles.previewMeta, { color: theme.text2, marginTop: guideText(report.body, resolved).trim() ? space.sm : 0 }]}>{formatObservationDate(report.publishedAt, resolved)}</Text>
      </View>
      {report.photos[0] ? <View style={styles.previewPhoto}><Image source={{ uri: report.photos[0] }} contentFit="cover" style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg }]} />{report.media?.[0]?.kind === 'livePhoto' ? <View pointerEvents="none" style={styles.previewLiveIcon}><Icon name="livePhoto" color="#fff" size={26} /></View> : report.media?.[0]?.kind === 'video' ? <View pointerEvents="none" style={styles.previewVideoIcon}><Icon name="play" color="#fff" size={12} /></View> : null}</View> : null}
    </View>;
    return onPress ? <Press accessibilityRole="button" onPress={onPress}>{preview}</Press> : preview;
  }
  const content = <>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
      <Avatar size={28} />
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{guideText(report.author, resolved)}</Text>
    </View>
    <Text style={{ color: theme.text2, fontSize: 11.5, lineHeight: 20, marginTop: space.xs }}>{formatObservationDate(report.publishedAt, resolved)}</Text>
    {guideText(report.body, resolved).trim() ? <Text style={{ color: theme.text, fontSize: 13, lineHeight: 23, marginTop: space.sm }}>{guideText(report.body, resolved)}</Text> : null}
    {(report.media?.length || report.photos.length) && width > 0 ? <View style={{ marginTop: space.md }}><ConditionMediaStrip theme={theme} report={report} /></View> : null}
    <Press accessibilityRole="button" accessibilityState={{ selected: helpful }} onPress={() => { if (helpful) return; setHelpful(true); setHelpfulCount((count) => count + 1); void markRouteConditionHelpful(report.id).catch(() => { setHelpful(false); setHelpfulCount((count) => Math.max(0, count - 1)); }); }} style={styles.helpfulAction}>
      <Heart color={helpful ? '#E5484D' : theme.text2} fill={helpful ? '#E5484D' : 'transparent'} size={16} />
      <Text style={{ color: helpful ? '#E5484D' : theme.text2, fontSize: 12 }}>{resolved === 'zh' ? '有帮助' : 'Helpful'} {helpfulCount}</Text>
    </Press>
  </>;
  const style = { paddingVertical: space.md };
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {onPress ? <Press accessibilityRole="button" onPress={onPress} style={style}>{content}</Press> : <View style={style}>{content}</View>}
  </View>;
}

function ConditionMediaStrip({ theme, report }: { theme: Theme; report: RouteCondition }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const media: NonNullable<RouteCondition['media']> = report.media?.length ? report.media : report.photos.map((uri) => ({ uri, kind: 'image' as const }));
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
      {media.map((item, index) => <Press key={`${item.uri}-${index}`} onPress={() => setSelectedIndex(index)} style={styles.mediaPreview}>
        <Image source={{ uri: item.thumbnail || item.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
        {item.kind === 'livePhoto' ? <View pointerEvents="none" style={styles.mediaLiveIcon}><Icon name="livePhoto" color="#fff" size={26} /></View> : item.kind === 'video' ? <View pointerEvents="none" style={styles.mediaVideoIcon}><Icon name="play" color="#fff" size={12} /></View> : null}
      </Press>)}
    </ScrollView>
    {selectedIndex !== null ? <ConditionMediaViewer media={media} initialIndex={selectedIndex} onClose={() => setSelectedIndex(null)} /> : null}
  </>;
}

function ConditionMediaViewer({ media, initialIndex, onClose }: { media: NonNullable<RouteCondition['media']>[number][]; initialIndex: number; onClose: () => void }) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const { width, height } = viewport;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const active = media[activeIndex];
  const liveVideoUri = active?.kind === 'livePhoto' ? active.pairedVideoUri ?? null : null;
  const livePlayer = useVideoPlayer(liveVideoUri, (value) => { value.loop = false; });
  const [livePlaying, setLivePlaying] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  useEventListener(livePlayer, 'statusChange', ({ status }) => setLiveReady(status === 'readyToPlay'));
  const dragY = useRef(new Animated.Value(0)).current;
  const pagingEnabled = useRef(true);
  const setPagingEnabled = (enabled: boolean) => {
    if (pagingEnabled.current === enabled) return;
    pagingEnabled.current = enabled;
    const native = scrollRef.current?.getNativeScrollRef?.() ?? scrollRef.current;
    (native as { setNativeProps?: (props: object) => void } | null)?.setNativeProps?.({ scrollEnabled: enabled });
  };
  useEffect(() => { setLivePlaying(false); setLiveReady(false); try { livePlayer?.pause(); } catch {} }, [activeIndex, livePlayer]);
  const startLive = () => {
    if (!liveVideoUri || !livePlayer) return;
    try { livePlayer.currentTime = 0; livePlayer.play(); setLivePlaying(true); } catch {}
  };
  const stopLive = () => { try { livePlayer?.pause(); if (livePlayer) livePlayer.currentTime = 0; } catch {} setLivePlaying(false); };
  const backdropOpacity = dragY.interpolate({ inputRange: [0, 72, height * 0.42 || 320], outputRange: [1, 0.62, 0], extrapolate: 'clamp' });
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.viewer}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropOpacity }]} />
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: dragY }] }]} onLayout={({ nativeEvent: { layout } }) => {
      setViewport((previous) => previous.width === layout.width && previous.height === layout.height
        ? previous
        : { width: layout.width, height: layout.height });
    }}>
      <Press accessibilityRole="button" accessibilityLabel="关闭" hitSlop={12} onPress={onClose} style={styles.viewerClose}><Text style={{ color: '#fff', fontSize: 28, lineHeight: 30 }}>×</Text></Press>
      <View pointerEvents="none" style={styles.viewerMediaBadge}>
        <View style={styles.viewerMediaBadgeInner}>
          {active?.kind === 'livePhoto' && !livePlaying ? <Icon name="livePhoto" color="#fff" size={15} strokeWidth={1.6} /> : null}
          <Text style={styles.viewerMediaBadgeText}>{media.length > 1 ? `${activeIndex + 1} / ${media.length}` : active?.kind === 'video' ? '视频' : active?.kind === 'livePhoto' ? '实况' : '图片'}</Text>
        </View>
      </View>
      {width > 0 && height > 0 ? <ScrollView
        key={`${width}-${height}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: width * activeIndex, y: 0 }}
        onMomentumScrollEnd={(event) => setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={styles.viewerPager}
        contentContainerStyle={{ height }}
      >
        {media.map((item, index) => <View key={`${item.uri}-${index}`} style={[styles.viewerPage, { width, height }]}>{item.kind === 'livePhoto' ? <ZoomableConditionImage uri={item.uri} width={width} height={height} active={index === activeIndex} dragY={dragY} onDismiss={onClose} onDismissGestureChange={(activeGesture) => setPagingEnabled(!activeGesture)} onLongPress={index === activeIndex ? startLive : undefined} onPressRelease={index === activeIndex ? stopLive : undefined}>{index === activeIndex && livePlaying && liveReady ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><VideoView player={livePlayer} nativeControls={false} contentFit="contain" style={StyleSheet.absoluteFill} /></View> : null}</ZoomableConditionImage> : item.kind === 'image' ? <ZoomableConditionImage uri={item.uri} width={width} height={height} active={index === activeIndex} dragY={dragY} onDismiss={onClose} onDismissGestureChange={(activeGesture) => setPagingEnabled(!activeGesture)} /> : index === activeIndex ? <ConditionVideoPlayer uri={item.uri} thumbnail={item.thumbnail} /> : <ConditionImage uri={item.thumbnail || item.uri} />}</View>)}
      </ScrollView> : null}
    </Animated.View>
    </View>
  </Modal>;
}

function ConditionVideoPlayer({ uri, thumbnail }: { uri: string; thumbnail?: string }) {
  const player = useVideoPlayer(uri, (value) => { value.loop = true; value.play(); });
  const [ready, setReady] = useState(player.status === 'readyToPlay');
  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'));
  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);
  return <View style={StyleSheet.absoluteFill}><Image source={{ uri: thumbnail || uri }} contentFit="contain" style={StyleSheet.absoluteFill} />{ready ? <VideoView player={player} nativeControls contentFit="contain" style={StyleSheet.absoluteFill} /> : <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />}</View>;
}

function ZoomableConditionImage({ uri, width, height, active, dragY, onDismiss, onDismissGestureChange, onLongPress, onPressRelease, children }: { uri: string; width: number; height: number; active: boolean; dragY: Animated.Value; onDismiss: () => void; onDismissGestureChange: (active: boolean) => void; onLongPress?: () => void; onPressRelease?: () => void; children?: React.ReactNode }) {
  const zoomRef = useRef<ReactNativeZoomableView>(null);
  const dismissActive = useRef(false);
  const longPressTriggered = useRef(false);
  const finish = (dy: number, vy: number, zoomLevel: number) => {
    const wasActive = dismissActive.current;
    dismissActive.current = false;
    if (!wasActive || !active || zoomLevel > 1.01) return;
    if (dy > 110 || (dy > 48 && vy > 1.1)) {
      Animated.timing(dragY, { toValue: height, duration: 180, useNativeDriver: true }).start(() => { onDismissGestureChange(false); setTimeout(onDismiss, 0); });
    } else Animated.spring(dragY, { toValue: 0, damping: 22, stiffness: 240, mass: 0.8, useNativeDriver: true }).start(() => onDismissGestureChange(false));
  };
  return <ReactNativeZoomableView ref={zoomRef} style={{ width, height }} initialZoom={1} minZoom={1} maxZoom={4} zoomStep={null as any} bindToBorders disablePanOnInitialZoom disableMomentum animatePin={false} visualTouchFeedbackEnabled={false} longPressDuration={360}
    onLongPress={() => { longPressTriggered.current = true; onLongPress?.(); }}
    onSingleTap={() => { if (longPressTriggered.current) longPressTriggered.current = false; }}
    onPanResponderMove={(_, gesture, info) => {
      if (longPressTriggered.current || !active || info.zoomLevel > 1.01 || gesture.numberActiveTouches !== 1) return false;
      const downward = gesture.dy > 0 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15;
      if (!downward) return false;
      if (!dismissActive.current) { dismissActive.current = true; onDismissGestureChange(true); }
      dragY.setValue(gesture.dy);
      return true;
    }}
    onPanResponderEnd={(_, gesture, info) => { finish(gesture.dy, gesture.vy, info.zoomLevel); onPressRelease?.(); }}
    onShouldBlockNativeResponder={(_, gesture, info) => info.zoomLevel > 1.05 || gesture.numberActiveTouches >= 2 || dismissActive.current || (gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.05)}
    onPanResponderTerminationRequest={(_, gesture, info) => !dismissActive.current && info.zoomLevel <= 1.05 && gesture.numberActiveTouches < 2}
  >
    <Image source={{ uri }} contentFit="contain" style={{ width, height }} />{children}
  </ReactNativeZoomableView>;
}

function ConditionImage({ uri }: { uri: string }) {
  return <Image source={{ uri }} contentFit="contain" contentPosition="center" style={StyleSheet.absoluteFill} />;
}

function formatObservationDate(value: string, locale: 'zh' | 'en') {
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (locale === 'zh' && days >= 0 && days <= 2) {
    const label = days === 0 ? '今天' : days === 1 ? '昨天' : '前天';
    return `${label} ${formatObservationClock(date)}`;
  }
  if (locale === 'en' && days >= 0 && days <= 2) {
    const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : '2 days ago';
    return `${label} ${formatObservationClock(date)}`;
  }
  if (locale === 'zh' && days > 2 && days < 7) return `${days}天前`;
  if (locale === 'en' && days > 2 && days < 7) return `${days} days ago`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', sameYear
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatObservationClock(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  previewText: { flex: 1, minWidth: 0 },
  previewBody: { fontSize: 14, lineHeight: 23 },
  previewMeta: { fontSize: 11.5, lineHeight: 19, marginTop: space.sm },
  previewPhoto: { width: 64, height: 64, borderRadius: radius.card },
  previewLiveIcon: { position: 'absolute', left: space.sm, bottom: space.sm },
  previewVideoIcon: { position: 'absolute', right: space.xs, top: space.xs, width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.48)' },
  mediaStrip: { gap: space.sm },
  mediaPreview: { width: 160, height: 160, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#222' },
  mediaLiveIcon: { position: 'absolute', left: space.sm, bottom: space.sm },
  mediaVideoIcon: { position: 'absolute', right: space.xs, top: space.xs, width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.48)' },
  viewer: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  viewerPager: { flex: 1, width: '100%' },
  viewerPage: { alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', zIndex: 10, elevation: 10, top: 52, right: space.lg, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  viewerMediaBadge: { position: 'absolute', top: 52, left: 0, right: 0, zIndex: 5, alignItems: 'center' },
  viewerMediaBadgeInner: { minWidth: 76, height: 36, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs, backgroundColor: 'rgba(22,22,24,0.42)' },
  viewerMediaBadgeText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700' },
  helpfulAction: { alignSelf: 'flex-start', minHeight: 36, marginTop: space.sm, paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
